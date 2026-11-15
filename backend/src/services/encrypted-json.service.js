import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "../config/env.js";

function getEncryptionKey() {
  if (!env.ocrEncryptionKey) {
    throw new Error("OCR_ENCRYPTION_KEY is not configured.");
  }
  const key =
    /^[\da-f]{64}$/i.test(env.ocrEncryptionKey)
      ? Buffer.from(env.ocrEncryptionKey, "hex")
      : Buffer.from(env.ocrEncryptionKey, "base64");
  if (key.length !== 32) {
    throw new Error("OCR_ENCRYPTION_KEY must encode exactly 32 bytes as base64 or 64 hex characters.");
  }
  return key;
}

export function encryptJson(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return {
    algorithm: "aes-256-gcm",
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

export function decryptJson(encrypted) {
  if (encrypted.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported encrypted document algorithm.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(encrypted.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(encrypted.authTag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(encrypted.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8"));
}
