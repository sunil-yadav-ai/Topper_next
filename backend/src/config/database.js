import mongoose from "mongoose";
import dns from "node:dns";
import { resolve } from "node:dns/promises";

import User from "../models/User.js";
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

/**
 * Temporary DNS diagnostics for Next.js process.
 */
async function diagnoseMongoDns(srvHostname) {
  const shardHostname =
    "ac-xdqtrkl-shard-00-00.nkwbumz.mongodb.net";

  const clusterHostname = srvHostname.replace(
    "_mongodb._tcp.",
    "",
  );

  console.log("[DNS DEBUG] Process information:", {
    servers: dns.getServers(),
    pid: process.pid,
    node: process.version,
    platform: process.platform,
  });

  // TEST 1: MongoDB shard A-record
  try {
    const records = await resolve(shardHostname, "A");

    console.log("[DNS DEBUG] Shard A-record SUCCESS:", records);
  } catch (error) {
    console.error("[DNS DEBUG] Shard A-record FAILED:", {
      code: error.code,
      message: error.message,
      syscall: error.syscall,
    });
  }

  // TEST 2: Generic SRV lookup
  try {
    const records = await resolve(srvHostname, "SRV");

    console.log("[DNS DEBUG] Generic SRV SUCCESS:", {
      recordCount: records.length,
      records,
    });
  } catch (error) {
    console.error("[DNS DEBUG] Generic SRV FAILED:", {
      code: error.code,
      message: error.message,
      syscall: error.syscall,
      hostname: error.hostname,
    });
  }

  // TEST 3: TXT lookup
  try {
    const records = await resolve(clusterHostname, "TXT");

    console.log("[DNS DEBUG] TXT SUCCESS:", {
      recordCount: records.length,
      records,
    });
  } catch (error) {
    console.error("[DNS DEBUG] TXT FAILED:", {
      code: error.code,
      message: error.message,
      syscall: error.syscall,
    });
  }

  // TEST 4: Cluster hostname A-record
  try {
    const records = await resolve(clusterHostname, "A");

    console.log("[DNS DEBUG] Cluster A-record SUCCESS:", records);
  } catch (error) {
    console.error("[DNS DEBUG] Cluster A-record FAILED:", {
      code: error.code,
      message: error.message,
    });
  }
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

    if (srvHostname) {
      await diagnoseMongoDns(srvHostname);
    }

    console.info("[database] Starting mongoose.connect().");

    await mongoose.connect(env.mongodbUri);
  }

  await migrateResourcesToPublicViewing();

  await migrateResourceSearchIndexes();

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
    .cursor();

  let migratedUsernames = 0;

  for await (const user of usersWithoutUsername) {
    const username = await createUniqueUsername(
      User,
      user.fullName,
    );

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

  console.log("MongoDB connected.");
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