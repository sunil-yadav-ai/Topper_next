import assert from "node:assert/strict";
import test from "node:test";
import { readRequestBody } from "./request-body.js";

test("reads request bodies within the configured byte limit", async () => {
  const request = new Request("http://localhost/api", {
    method: "POST",
    body: "small body",
  });

  assert.equal((await readRequestBody(request, 32, "Too large.")).toString(), "small body");
});

test("rejects oversized streamed bodies with the requested error code", async () => {
  const request = new Request("http://localhost/api", {
    method: "POST",
    body: "this body is too large",
  });

  await assert.rejects(
    readRequestBody(request, 8, "Too large.", "LIMIT_FILE_SIZE"),
    { statusCode: 413, code: "LIMIT_FILE_SIZE" },
  );
});
