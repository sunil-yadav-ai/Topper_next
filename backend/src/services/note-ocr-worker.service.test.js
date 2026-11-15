import assert from "node:assert/strict";
import test from "node:test";
import { shouldExhaustOcrJob } from "./note-ocr-worker.service.js";

test("retryable Vision rate limits do not exhaust the OCR job attempt budget", () => {
  assert.equal(shouldExhaustOcrJob({ retryableRateLimit: true }, 3), false);
  assert.equal(shouldExhaustOcrJob({ retryableRateLimit: true }, 30), false);
  assert.equal(shouldExhaustOcrJob({ retryableRateLimit: false }, 1), true);
  assert.equal(
    shouldExhaustOcrJob(
      { retryableRateLimit: false, providerErrorCode: "credit_balance_exhausted" },
      1,
    ),
    true,
  );
  assert.equal(shouldExhaustOcrJob(new Error("network error"), 2), false);
  assert.equal(shouldExhaustOcrJob(new Error("network error"), 3), true);
});
