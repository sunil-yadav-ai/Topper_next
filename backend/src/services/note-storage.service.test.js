import assert from "node:assert/strict";
import test from "node:test";
import { validateNoteFile } from "./note-storage.service.js";

test("accepts supported note formats only when MIME type and file signature agree", () => {
  const validFiles = [
    {
      originalname: "notes.PDF",
      mimetype: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n"),
      format: "pdf",
    },
    {
      originalname: "notes.png",
      mimetype: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      format: "png",
    },
    {
      originalname: "notes.jpg",
      mimetype: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      format: "jpg",
    },
    {
      originalname: "notes.jpeg",
      mimetype: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      format: "jpeg",
    },
  ];

  for (const file of validFiles) {
    assert.deepEqual(validateNoteFile(file), {
      format: file.format,
      mimeType: file.mimetype,
    });
  }
});

test("rejects mismatched extensions, MIME types, and file signatures", () => {
  for (const file of [
    {
      originalname: "notes.exe",
      mimetype: "application/pdf",
      buffer: Buffer.from("%PDF-1.7"),
    },
    {
      originalname: "notes.pdf",
      mimetype: "image/jpeg",
      buffer: Buffer.from("%PDF-1.7"),
    },
    {
      originalname: "notes.png",
      mimetype: "image/png",
      buffer: Buffer.from("not a PNG"),
    },
    {
      originalname: "notes.jpg",
      mimetype: "image/jpeg",
      buffer: Buffer.from("not a JPEG"),
    },
  ]) {
    assert.throws(() => validateNoteFile(file), { statusCode: 400 });
  }
});
