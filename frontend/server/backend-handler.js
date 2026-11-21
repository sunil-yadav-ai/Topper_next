import { dispatchApiRequest } from "../../backend/src/app.js";
import {
  connectDatabase,
  formatDatabaseError,
  runDatabaseMaintenance,
} from "../../backend/src/config/database.js";
import { startNoteOcrWorker } from "../../backend/src/services/note-ocr-worker.service.js";

const backendStateKey = Symbol.for("topper.backend.startup-state");
const backendState = (globalThis[backendStateKey] ??= {
  promise: null,
  workerStarted: false,
  failureCount: 0,
  retryAt: 0,
});
const baseRetryDelayMs = 5_000;
const maxRetryDelayMs = 60_000;

function initializeBackend() {
  if (backendState.workerStarted) return connectDatabase();
  if (backendState.promise) return backendState.promise;

  const retryAfterMs = backendState.retryAt - Date.now();
  if (retryAfterMs > 0) {
    const error = new Error(
      `API initialization is backing off after a recent failure. Retry in ${Math.ceil(retryAfterMs / 1000)} seconds.`,
    );
    error.code = "API_STARTUP_BACKOFF";
    error.retryAfterMs = retryAfterMs;
    return Promise.reject(error);
  }

  const attempt = connectDatabase()
    .then(() => {
      startNoteOcrWorker();
      backendState.workerStarted = true;
      backendState.failureCount = 0;
      backendState.retryAt = 0;
      void runDatabaseMaintenance().catch(() => {});
    })
    .catch((error) => {
      backendState.failureCount += 1;
      const retryDelay = error.retryAfterMs ?? Math.min(
        baseRetryDelayMs * 2 ** Math.min(backendState.failureCount - 1, 4),
        maxRetryDelayMs,
      );
      backendState.retryAt = Date.now() + retryDelay;
      if (!error.databaseErrorLogged && error.code !== "MONGODB_RETRY_BACKOFF") {
        console.error(
          "[api] Backend initialization failed.",
          formatDatabaseError(error),
        );
      }
      throw error;
    })
    .finally(() => {
      if (backendState.promise === attempt) backendState.promise = null;
    });
  backendState.promise = attempt;
  return attempt;
}

export async function handleBackendRequest(request, stripPrefix = "") {
  try {
    await initializeBackend();
  } catch (error) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((error.retryAfterMs ?? baseRetryDelayMs) / 1000),
    );
    return new Response(
      JSON.stringify({ message: "The API server is unavailable." }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Retry-After": String(retryAfterSeconds),
        },
      },
    );
  }

  const url = new URL(request.url);
  let pathname = url.pathname;
  if (
    stripPrefix &&
    (pathname === stripPrefix || pathname.startsWith(`${stripPrefix}/`))
  ) {
    pathname = pathname.slice(stripPrefix.length) || "/";
  }
  return dispatchApiRequest(request, pathname);
}
