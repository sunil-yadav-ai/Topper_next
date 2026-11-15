import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

function getCloudinary() {
  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    const error = new Error("PYQ storage is not configured. Contact an administrator.");
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

export async function uploadPyqFile(file) {
  const storage = getCloudinary();
  const format = file.originalname.split(".").pop()?.toLowerCase() ?? "pdf";
  return new Promise((resolve, reject) => {
    const upload = storage.uploader.upload_stream(
      {
        folder: "academic-pyqs",
        public_id: randomUUID(),
        resource_type: "raw",
        type: "authenticated",
        overwrite: false,
      },
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          provider: "cloudinary",
          publicId: result.public_id,
          resourceType: "raw",
          accessType: "authenticated",
          format,
          mimeType: file.mimetype,
          bytes: file.size,
        });
      },
    );
    upload.end(file.buffer);
  });
}

export async function deletePyqFile(storageInfo) {
  const storage = getCloudinary();
  const result = await storage.uploader.destroy(storageInfo.publicId, {
    resource_type: "raw",
    type: storageInfo.accessType ?? "upload",
    invalidate: true,
  });
  if (!["ok", "not found"].includes(result.result)) {
    throw new Error("The PYQ PDF could not be deleted from storage.");
  }
}

export function getPyqFileUrl(storageInfo) {
  const storage = getCloudinary();
  const format = storageInfo.format ?? "pdf";
  return storage.utils.private_download_url(storageInfo.publicId, format, {
    resource_type: "raw",
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + 300,
  });
}

export async function secureLegacyPyqFile(storageInfo) {
  if ((storageInfo.accessType ?? "upload") === "authenticated") return storageInfo;

  const storage = getCloudinary();
  const oldType = storageInfo.accessType ?? "upload";
  const newPublicId = `${storageInfo.publicId}-secure-${randomUUID()}`;
  const renamed = await storage.uploader.rename(
    storageInfo.publicId,
    newPublicId,
    {
      resource_type: "raw",
      type: oldType,
      to_type: "authenticated",
      invalidate: true,
    },
  );
  return {
    ...storageInfo,
    publicId: renamed.public_id,
    accessType: "authenticated",
  };
}
