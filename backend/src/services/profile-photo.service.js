import { randomUUID } from "node:crypto";
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

const imageFormats = new Set(["jpg", "jpeg", "png", "webp"]);
const maximumImageBytes = 8 * 1024 * 1024;

function getCloudinary() {
  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    const error = new Error("Profile photo uploads are not configured.");
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

export function validateProfileImage(file, imageType = "avatar") {
  const fileExtension = file?.originalname?.split(".").pop()?.toLowerCase();
  const extension = fileExtension === "jpeg" ? "jpg" : fileExtension;
  const expectedMime = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
  if (!file || !Buffer.isBuffer(file.buffer) || !imageFormats.has(fileExtension)) {
    const error = new Error("Choose a valid JPG, JPEG, PNG, or WebP image.");
    error.statusCode = 400;
    throw error;
  }
  const fileLimit = imageType === "avatar" ? 5 * 1024 * 1024 : maximumImageBytes;
  if (file.buffer.length < 1 || file.buffer.length > fileLimit) {
    const error = new Error(
      `${imageType === "avatar" ? "Profile pictures" : "Cover images"} must be 1 byte to ${fileLimit / (1024 * 1024)} MB.`,
    );
    error.statusCode = 400;
    throw error;
  }
  const validSignature =
    extension === "png" && file.buffer.subarray(0, 8).equals(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ) ||
    extension === "jpg" &&
      file.buffer[0] === 0xff &&
      file.buffer[1] === 0xd8 &&
      file.buffer[2] === 0xff ||
    extension === "webp" &&
      file.buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      file.buffer.subarray(8, 12).toString("ascii") === "WEBP";
  if (!validSignature || file.mimetype !== expectedMime) {
    const error = new Error("The image contents do not match a supported JPG, PNG, or WebP file.");
    error.statusCode = 400;
    throw error;
  }
  return { format: extension, mimeType: expectedMime };
}

async function uploadProfileImage(file, imageType) {
  const { format } = validateProfileImage(file, imageType);
  const storage = getCloudinary();
  return new Promise((resolve, reject) => {
    const upload = storage.uploader.upload_stream(
      {
        folder: imageType === "avatar" ? "user-profile-photos" : "user-profile-covers",
        public_id: randomUUID(),
        resource_type: "image",
        type: "upload",
        overwrite: false,
        transformation: imageType === "avatar"
          ? [{ width: 512, height: 512, crop: "fill", gravity: "center" }]
          : [{ width: 1600, height: 560, crop: "fill", gravity: "center" }],
      },
      (error, result) => {
        if (error) {
          const failure = new Error(
            imageType === "avatar"
              ? "The profile picture could not be uploaded."
              : "The cover image could not be uploaded.",
          );
          failure.statusCode = 503;
          failure.code = typeof error.code === "string" ? error.code : "CLOUDINARY_UPLOAD_FAILED";
          reject(failure);
          return;
        }
        resolve({ url: result.secure_url, publicId: result.public_id, format });
      },
    );
    upload.end(file.buffer);
  });
}

export function uploadProfilePhoto(file) {
  return uploadProfileImage(file, "avatar");
}

export function uploadProfileCover(file) {
  return uploadProfileImage(file, "cover");
}

export async function deleteProfileImage(publicId) {
  if (!publicId) return;
  const result = await getCloudinary().uploader.destroy(publicId, {
    resource_type: "image",
    type: "upload",
    invalidate: true,
  });
  if (!["ok", "not found"].includes(result.result)) {
    throw new Error("The old profile image could not be removed from storage.");
  }
}

export const deleteProfilePhoto = deleteProfileImage;
