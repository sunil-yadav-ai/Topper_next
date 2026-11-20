import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const authCookieName = "studyshare_token";
export const authCookiePath = "/api";
export const legacyAuthCookiePath = "/api/auth";
export const authTokenLifetimeMs = 30 * 24 * 60 * 60 * 1000;

export function hashActionToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createEmailVerificationCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashEmailVerificationCode(email, code) {
  return createHmac("sha256", getJwtSecret())
    .update(`${email.trim().toLowerCase()}:${code}`)
    .digest("hex");
}

export function createActionToken() {
  return randomBytes(32).toString("hex");
}

function getJwtSecret() {
  if (env.jwtSecret.length < 32) {
    const error = new Error("JWT_SECRET must be configured with at least 32 characters.");
    error.statusCode = 503;
    throw error;
  }

  return env.jwtSecret;
}

export function signAuthToken(user) {
  return jwt.sign(
    { ver: user.authVersion },
    getJwtSecret(),
    { subject: user.id, expiresIn: "30d", algorithm: "HS256" },
  );
}

export function verifyAuthToken(token) {
  return jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });
}

export function getAuthCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: authCookiePath,
    maxAge: authTokenLifetimeMs,
  };
}

export function getClearCookieOptions() {
  const { maxAge: _maxAge, ...options } = getAuthCookieOptions();
  return options;
}

export function createActionUrl(path, token) {
  const url = new URL(path, env.frontendUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export function validatePassword(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    Buffer.byteLength(password, "utf8") <= 72
  );
}
