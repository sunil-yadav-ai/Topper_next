import mongoose from "mongoose";
import dns from "node:dns";
import { performance } from "node:perf_hooks";

import User from "../models/User.js";
import Scholarship from "../models/Scholarship.js";
import { env } from "./env.js";
import { createUniqueUsername } from "../services/username.service.js";
import { migrateResourcesToPublicViewing } from "../services/resource-migration.service.js";
import { migrateResourceSearchIndexes } from "../services/resource-search-index-migration.service.js";

const databaseStateKey = Symbol.for("topper.database.connection-state");

const databaseState = (globalThis[databaseStateKey] ??= {
  promise: null,
  initialized: false,
  failureCount: 0,
  retryAt: 0,
});
const databaseMaintenanceKey = Symbol.for("topper.database.maintenance-state");
const databaseMaintenance = (globalThis[databaseMaintenanceKey] ??= {
  promise: null,
  completed: false,
});

const baseRetryDelayMs = 5_000;
const maxRetryDelayMs = 60_000;

const mongodbUriPattern = /mongodb(?:\+srv)?:\/\/[^\s"'<>]+/gi;

function getMongoSrvHostname() {
  if (!env.mongodbUri.startsWith("mongodb+srv://")) return null;
  const uri = new URL(env.mongodbUri);
  return `_mongodb._tcp.${uri.hostname}`;
}

function retryDelayFor(failureCount) {
  return Math.min(
    baseRetryDelayMs * 2 ** Math.min(failureCount - 1, 4),
    maxRetryDelayMs,
  );
}

function createRetryError(retryAfterMs) {
  const error = new Error(
    `MongoDB initialization is backing off after a recent failure. Retry in ${Math.ceil(
      retryAfterMs / 1000,
    )} seconds.`,
  );

  error.code = "MONGODB_RETRY_BACKOFF";
  error.retryAfterMs = retryAfterMs;

  return error;
}

function redactMongoUri(value) {
  return String(value ?? "").replace(
    mongodbUriPattern,
    "[REDACTED_MONGODB_URI]",
  );
}

export function formatDatabaseError(error) {
  const cause = error?.cause;

  const details = {
    name: error?.name ?? "Error",
    message: redactMongoUri(error?.message ?? error),
  };

  for (const key of ["code", "syscall", "hostname"]) {
    const value = error?.[key] ?? cause?.[key];

    if (value != null) {
      details[key] = value;
    }
  }

  if (cause?.message) {
    details.causeMessage = redactMongoUri(cause.message);
  }

  return details;
}

async function initializeDatabase() {
  if (mongoose.connection.readyState === 2) {
    await mongoose.connection.asPromise();
  } else if (mongoose.connection.readyState !== 1) {
    const srvHostname = getMongoSrvHostname();

    console.info(
      "[database] DNS configuration before MongoDB connection:",
      {
        configured: env.mongodbDnsServers.length > 0,
        servers: dns.getServers(),
        srvEnabled: Boolean(srvHostname),
      },
    );

    console.info("[database] Starting mongoose.connect().");

    const startedAt = performance.now();
    await mongoose.connect(env.mongodbUri, {
      serverSelectionTimeoutMS: 5_000,
      connectTimeoutMS: 5_000,
      socketTimeoutMS: 45_000,
      maxPoolSize: 10,
      minPoolSize: 0,
      maxConnecting: 2,
    });
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[database] Cold connection established in ${Math.round(performance.now() - startedAt)} ms.`,
      );
    }
  }
}

async function initializeDatabaseMaintenance() {
  await migrateResourcesToPublicViewing();
  await migrateResourceSearchIndexes();

  await Scholarship.collection.dropIndex("stateRequirements_1_scholarshipType_1_educationLevels_1")
    .catch((error) => {
      if (error?.codeName !== "IndexNotFound" && error?.code !== 27) throw error;
    });
  await Scholarship.collection.createIndex(
    { stateRequirements: 1, scholarshipType: 1 },
    { name: "stateRequirements_1_scholarshipType_1" },
  );
  await Scholarship.collection.createIndex(
    { educationLevels: 1, scholarshipType: 1 },
    { name: "educationLevels_1_scholarshipType_1" },
  );

  await User.updateMany(
    { college: { $exists: true } },
    { $unset: { college: "" } },
  );
  await User.collection
    .dropIndex("college_1")
    .catch((error) => {
      if (error?.codeName !== "IndexNotFound") throw error;
    });

  const migration = await User.updateMany(
    { role: "student" },
    { $set: { role: "user" } },
  );

  if (migration.modifiedCount > 0) {
    console.log(
      `Migrated ${migration.modifiedCount} account role(s) to user.`,
    );
  }

  const usersWithoutUsername = User.find({
    $or: [
      { username: { $exists: false } },
      { username: null },
      { username: "" },
    ],
  })
    .select("_id fullName")
    .lean()
    .cursor();

  let migratedUsernames = 0;
  for await (const user of usersWithoutUsername) {
    const username = await createUniqueUsername(User, user.fullName);
    await User.updateOne(
      { _id: user._id },
      { $set: { username } },
    );

    migratedUsernames += 1;
  }

  if (migratedUsernames > 0) {
    console.log(
      `Created usernames for ${migratedUsernames} existing account(s).`,
    );
  }
}

export function runDatabaseMaintenance() {
  if (databaseMaintenance.completed) return Promise.resolve();
  if (databaseMaintenance.promise) return databaseMaintenance.promise;
  const startedAt = performance.now();
  const maintenance = initializeDatabaseMaintenance()
    .then(() => {
      databaseMaintenance.completed = true;
      if (process.env.NODE_ENV !== "production") {
        console.info(
          `[database] Maintenance completed in ${Math.round(performance.now() - startedAt)} ms.`,
        );
      }
    })
    .catch((error) => {
      console.error("[database] Non-blocking maintenance failed.", {
        name: error?.name ?? "Error",
        code: error?.code,
      });
      throw error;
    });
  databaseMaintenance.promise = maintenance;
  return maintenance;
}

export function connectDatabase() {
  if (
    databaseState.initialized &&
    mongoose.connection.readyState === 1
  ) {
    return Promise.resolve();
  }

  if (databaseState.promise) {
    return databaseState.promise;
  }

  const retryAfterMs = databaseState.retryAt - Date.now();

  if (retryAfterMs > 0) {
    return Promise.reject(createRetryError(retryAfterMs));
  }

  const attempt = initializeDatabase()
    .then(() => {
      databaseState.initialized = true;
      databaseState.failureCount = 0;
      databaseState.retryAt = 0;
    })
    .catch((error) => {
      databaseState.initialized = false;

      databaseState.failureCount += 1;

      const delay = retryDelayFor(
        databaseState.failureCount,
      );

      databaseState.retryAt = Date.now() + delay;

      console.error(
        "[database] MongoDB initialization failed.",
        formatDatabaseError(error),
      );

      const failure = new Error(
        "MongoDB initialization failed.",
        { cause: error },
      );

      failure.code =
        error?.code ??
        error?.cause?.code ??
        "MONGODB_CONNECTION_FAILED";

      failure.retryAfterMs = delay;
      failure.databaseErrorLogged = true;

      throw failure;
    })
    .finally(() => {
      if (databaseState.promise === attempt) {
        databaseState.promise = null;
      }
    });

  databaseState.promise = attempt;

  return attempt;
}