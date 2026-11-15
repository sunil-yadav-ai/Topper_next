import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

const supportedFormats = new Set(["pdf", "jpg", "jpeg", "png"]);

function getCloudinary() {
  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    const error = new Error("Note uploads are not configured. Contact an administrator.");
    error.statusCode = 503;
    throw error;
  }

  cloudinary.config({
    cloud_name: env.cloudinaryCloudName,
    api_key: env.cloudinaryApiKey,
    api_secret: env.cloudinaryApiSecret,
    secure: true,
  });
  return cloudinary;
}

export function getNoteFormat(fileName) {
  const format = fileName.split(".").pop()?.toLowerCase();
  return supportedFormats.has(format) ? format : null;
}

export function validateNoteFile(file) {
  const format = getNoteFormat(file.originalname);
  const expectedMimeType =
    format === "pdf"
      ? "application/pdf"
      : format === "png"
        ? "image/png"
        : "image/jpeg";

  if (!format || file.mimetype !== expectedMimeType) {
    const error = new Error("Upload a PDF, JPG, JPEG, or PNG file.");
    error.statusCode = 400;
    throw error;
  }

  const validSignature =
    format === "pdf"
      ? file.buffer.subarray(0, 5).toString("ascii") === "%PDF-"
      : format === "png"
        ? file.buffer.subarray(0, 8).equals(
            Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
          )
        : file.buffer[0] === 0xff &&
          file.buffer[1] === 0xd8 &&
          file.buffer[2] === 0xff;

  if (!validSignature) {
    const error = new Error("The file contents do not match the selected file type.");
    error.statusCode = 400;
    throw error;
  }

  return { format, mimeType: expectedMimeType };
}

export async function uploadNoteFile(file, format) {
  const storage = getCloudinary();
  const resourceType = format === "pdf" ? "raw" : "image";

  const result = await new Promise((resolve, reject) => {
    const upload = storage.uploader.upload_stream(
      {
        folder: "student-notes",
        public_id: randomUUID(),
        resource_type: resourceType,
        type: "authenticated",
        overwrite: false,
      },
      (error, uploaded) => {
        if (error) reject(error);
        else resolve(uploaded);
      },
    );
    upload.end(file.buffer);
  });

  return {
    provider: "cloudinary",
    publicId: result.public_id,
    resourceType,
    format,
    mimeType: file.mimetype,
    bytes: file.size,
  };
}

export async function uploadNotePreview(buffer) {
  const storage = getCloudinary();
  const result = await new Promise((resolve, reject) => {
    const upload = storage.uploader.upload_stream(
      {
        folder: "student-notes/previews",
        public_id: randomUUID(),
        resource_type: "image",
        type: "authenticated",
        overwrite: false,
        format: "png",
      },
      (error, uploaded) => {
        if (error) reject(error);
        else resolve(uploaded);
      },
    );
    upload.end(buffer);
  });

  return {
    provider: "cloudinary",
    publicId: result.public_id,
    resourceType: "image",
    format: "png",
    mimeType: "image/png",
    bytes: buffer.length,
  };
}

export async function deleteNoteFile(storageInfo) {
  const storage = getCloudinary();
  const result = await storage.uploader.destroy(storageInfo.publicId, {
    resource_type: storageInfo.resourceType,
    type: "authenticated",
    invalidate: true,
  });

  if (!["ok", "not found"].includes(result.result)) {
    throw new Error("The stored note could not be deleted.");
  }
}

export async function deleteNotePreview(storageInfo) {
  if (!storageInfo) return;

  const storage = getCloudinary();
  const result = await storage.uploader.destroy(storageInfo.publicId, {
    resource_type: "image",
    type: "authenticated",
    invalidate: true,
  });

  if (!["ok", "not found"].includes(result.result)) {
    throw new Error("The stored note preview could not be deleted.");
  }
}

export function getPrivateNoteDownloadUrl(storageInfo) {
  const storage = getCloudinary();
  return storage.utils.private_download_url(
    storageInfo.publicId,
    storageInfo.format,
    {
      resource_type: storageInfo.resourceType,
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 300,
    },
  );
}

export function getPrivateNotePreviewUrl(note) {
  const previewStorage = note.previewStorage?.publicId
    ? note.previewStorage
    : note.storage.resourceType === "image"
      ? note.storage
      : null;
  if (!previewStorage) {
    throw new Error("A preview image has not been generated for this note.");
  }

  const storage = getCloudinary();
  return storage.utils.private_download_url(
    previewStorage.publicId,
    previewStorage.format,
    {
      resource_type: "image",
      type: "authenticated",
      expires_at: Math.floor(Date.now() / 1000) + 300,
    },
  );
}
