import assert from "node:assert/strict";
import test from "node:test";
import { createRequestContext } from "../lib/router.js";
import { receiveMultipart } from "./next-upload.js";

async function receive(middleware, request) {
  return new Promise((resolve) => {
    middleware(request, {}, (error) => resolve(error ?? null));
  });
}

function multipartRequest(formData) {
  const webRequest = new Request("http://localhost/upload", {
    method: "POST",
    body: formData,
  });
  return createRequestContext(webRequest);
}

test("multipart uploads expose file buffers and text fields to controllers", async () => {
  const formData = new FormData();
  formData.append("title", "Lecture notes");
  formData.append(
    "file",
    new Blob(["sample PDF"], { type: "application/pdf" }),
    "notes.pdf",
  );
  const request = multipartRequest(formData);
  const error = await receive(
    receiveMultipart({ fields: ["file"], maxFileSize: 1024, single: true }),
    request,
  );

  assert.equal(error, null);
  assert.equal(request.body.title, "Lecture notes");
  assert.equal(request.file.originalname, "notes.pdf");
  assert.equal(request.file.mimetype, "application/pdf");
  assert.equal(request.file.buffer.toString(), "sample PDF");
});

test("multipart uploads reject duplicate profile-image fields", async () => {
  const formData = new FormData();
  const image = new Blob(["image"], { type: "image/png" });
  formData.append("avatar", image, "avatar.png");
  formData.append("avatar", image, "duplicate.png");
  const request = multipartRequest(formData);
  const error = await receive(
    receiveMultipart({
      fields: { avatar: 1, cover: 1 },
      maxFileSize: 1024,
      maxFiles: 2,
    }),
    request,
  );

  assert.equal(error.code, "LIMIT_UNEXPECTED_FILE");
});

test("multipart uploads report oversized files for route-specific error handling", async () => {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob(["too large"], { type: "application/pdf" }),
    "notes.pdf",
  );
  const request = multipartRequest(formData);
  const error = await receive(
    receiveMultipart({
      fields: ["file"],
      maxFileSize: 4,
      uploadKind: "pyq",
    }),
    request,
  );

  assert.equal(error.code, "LIMIT_FILE_SIZE");
  assert.equal(error.uploadKind, "pyq");
});
