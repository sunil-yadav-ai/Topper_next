import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import { connectDatabase, formatDatabaseError } from "./database.js";

test("MongoDB initialization backs off instead of reconnecting on every request", async () => {
  const originalConnect = mongoose.connect;
  const originalConsoleError = console.error;
  let connectionAttempts = 0;
  mongoose.connect = async () => {
    connectionAttempts += 1;
    throw Object.assign(new Error("querySrv ECONNREFUSED"), {
      code: "ECONNREFUSED",
      syscall: "querySrv",
      hostname: "_mongodb._tcp.example.mongodb.net",
    });
  };
  console.error = () => {};

  try {
    await assert.rejects(connectDatabase(), (error) => {
      assert.equal(error.code, "ECONNREFUSED");
      assert.ok(error.retryAfterMs > 0);
      return true;
    });
    await assert.rejects(connectDatabase(), {
      code: "MONGODB_RETRY_BACKOFF",
    });
    assert.equal(connectionAttempts, 1);
  } finally {
    mongoose.connect = originalConnect;
    console.error = originalConsoleError;
  }
});

test("database error details redact MongoDB credentials", () => {
  const details = formatDatabaseError(
    new Error(
      "Failed to connect to mongodb+srv://test-user:test-password@cluster.example/db",
    ),
  );
  const serialized = JSON.stringify(details);

  assert.match(serialized, /\[REDACTED_MONGODB_URI\]/);
  assert.doesNotMatch(serialized, /test-password/);
});
