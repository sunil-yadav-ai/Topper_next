import assert from "node:assert/strict";
import test from "node:test";
import { errorHandler } from "./errorHandler.js";

function responseCapture() {
  return {
    statusCode: 0,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("reports the correct limit for PYQ and note uploads", () => {
  const pyqResponse = responseCapture();
  errorHandler(
    { code: "LIMIT_FILE_SIZE", uploadKind: "pyq" },
    {},
    pyqResponse,
    () => {},
  );
  assert.equal(pyqResponse.statusCode, 413);
  assert.equal(
    pyqResponse.body.message,
    "Question paper PDFs must be 20 MB or smaller.",
  );

  const noteResponse = responseCapture();
  errorHandler(
    { code: "LIMIT_FILE_SIZE" },
    {},
    noteResponse,
    () => {},
  );
  assert.equal(noteResponse.statusCode, 413);
  assert.equal(noteResponse.body.message, "Note files must be 10 MB or smaller.");
});

test("reports syllabus-specific upload validation errors", () => {
  const response = responseCapture();
  errorHandler(
    { code: "LIMIT_FILE_SIZE" },
    { originalUrl: "/api/syllabus-analyses" },
    response,
    () => {},
  );
  assert.equal(response.statusCode, 413);
  assert.equal(response.body.message, "Syllabus files must be 10 MB or smaller.");
});

test("reports duplicate mobile registration errors clearly", () => {
  const response = responseCapture();
  errorHandler(
    { code: 11000, keyPattern: { phoneNumber: 1 } },
    {},
    response,
    () => {},
  );
  assert.equal(response.statusCode, 409);
  assert.equal(
    response.body.message,
    "An account with this mobile number already exists.",
  );
});
