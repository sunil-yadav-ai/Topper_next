import assert from "node:assert/strict";
import test from "node:test";
import { streamResourceView } from "./resource-view.service.js";

test("streams a requested PDF byte range inline without exposing a storage URL", async () => {
  const originalFetch = globalThis.fetch;
  const body = Buffer.from("%PDF-1.7 sample");
  let fetchedUrl;
  let forwardedRange;
  globalThis.fetch = async (url, options) => {
    fetchedUrl = url;
    forwardedRange = options.headers.Range;
    return new Response(body, {
      status: 206,
      headers: {
        "content-range": `bytes 0-${body.length - 1}/${body.length}`,
        "content-length": String(body.length),
      },
    });
  };
  const headers = new Headers();
  const response = {
    statusCode: 200,
    body: null,
    set(name, value) {
      if (typeof name === "string") headers.set(name, value);
      else {
        for (const [field, headerValue] of Object.entries(name)) {
          headers.set(field, headerValue);
        }
      }
      return this;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    stream(value) {
      this.body = value;
      return this;
    },
  };

  try {
    await streamResourceView(
      { get: (name) => name === "range" ? "bytes=0-14" : undefined },
      response,
      {
        url: "https://secure-storage.example/signed-file",
        format: "pdf",
        fileName: "lecture notes.pdf",
        uploaderName: "Aarav Sharma",
      },
    );
    const streamedResponse = new Response(response.body, {
      status: response.statusCode,
      headers,
    });
    assert.equal(fetchedUrl, "https://secure-storage.example/signed-file");
    assert.equal(forwardedRange, "bytes=0-14");
    assert.equal(response.statusCode, 206);
    assert.equal(headers.get("Content-Type"), "application/pdf");
    assert.equal(headers.get("X-Resource-Uploader"), "Aarav%20Sharma");
    assert.match(headers.get("Content-Disposition"), /^inline;/);
    assert.equal(headers.get("Cache-Control"), "private, no-store");
    assert.equal(headers.get("Accept-Ranges"), "bytes");
    assert.equal(headers.get("content-range"), `bytes 0-${body.length - 1}/${body.length}`);
    assert.deepEqual(Buffer.from(await streamedResponse.arrayBuffer()), body);
    assert.equal(
      Array.from(headers.values()).join(" ").includes("secure-storage.example"),
      false,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects multiple byte ranges before contacting storage", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Storage should not be contacted for an invalid range.");
  };
  try {
    await assert.rejects(
      streamResourceView(
        { get: () => "bytes=0-1,4-5" },
        {},
        { url: "https://secure-storage.example/file", format: "pdf", fileName: "file.pdf" },
      ),
      { statusCode: 400 },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
