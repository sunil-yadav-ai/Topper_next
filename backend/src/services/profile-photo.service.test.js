import assert from "node:assert/strict";
import test from "node:test";
import {
  uploadProfilePhoto,
  validateProfileImage,
} from "./profile-photo.service.js";

test("rejects images with mismatched extension, MIME type, or signature", async () => {
  await assert.rejects(
    uploadProfilePhoto({
      originalname: "photo.png",
      mimetype: "image/png",
      buffer: Buffer.from("not an image"),
    }),
    { statusCode: 400 },
  );
  await assert.rejects(
    uploadProfilePhoto({
      originalname: "photo.jpg",
      mimetype: "image/png",
      buffer: Buffer.from([0xff, 0xd8, 0xff]),
    }),
    { statusCode: 400 },
  );
});

test("validates supported profile image formats using signatures and MIME types", () => {
  assert.deepEqual(
    validateProfileImage({
      originalname: "profile.png",
      mimetype: "image/png",
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    }),
    { format: "png", mimeType: "image/png" },
  );
  assert.deepEqual(
    validateProfileImage({
      originalname: "cover.jpeg",
      mimetype: "image/jpeg",
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
    }, "cover"),
    { format: "jpg", mimeType: "image/jpeg" },
  );
  assert.deepEqual(
    validateProfileImage({
      originalname: "cover.webp",
      mimetype: "image/webp",
      buffer: Buffer.from("RIFF0000WEBP"),
    }, "cover"),
    { format: "webp", mimeType: "image/webp" },
  );
});

test("rejects missing, invalid, and oversized profile images", () => {
  assert.throws(() => validateProfileImage(undefined), { statusCode: 400 });
  assert.throws(() => validateProfileImage({
    originalname: "profile.gif",
    mimetype: "image/gif",
    buffer: Buffer.from("GIF89a"),
  }), { statusCode: 400 });
  assert.throws(() => validateProfileImage({
    originalname: "cover.webp",
    mimetype: "image/webp",
    buffer: Buffer.alloc(8 * 1024 * 1024 + 1),
  }, "cover"), { statusCode: 400 });
});
