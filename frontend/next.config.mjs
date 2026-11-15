import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = path.dirname(fileURLToPath(import.meta.url));
const publisherId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? "";

if (publisherId && !/^ca-pub-\d+$/.test(publisherId)) {
  throw new Error("NEXT_PUBLIC_ADSENSE_CLIENT_ID must be a valid ca-pub- publisher ID.");
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.resolve(frontendRoot, ".."),
  serverExternalPackages: [
    "@google/genai",
    "@napi-rs/canvas",
    "bcryptjs",
    "cloudinary",
    "dotenv",
    "jsonwebtoken",
    "mongoose",
    "nodemailer",
    "pdf-lib",
    "pdfjs-dist",
  ],
  webpack(config) {
    config.module.rules.push({
      resourceQuery: /url/,
      type: "asset/resource",
    });
    return config;
  },
};

export default nextConfig;
