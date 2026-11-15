import { randomBytes } from "node:crypto";

export const usernamePattern = /^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/;

export function normalizeUsername(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function usernameBase(fullName) {
  const base = fullName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^[.]+|[.]+$/g, "")
    .slice(0, 20)
    .replace(/[.]+$/g, "");
  return base || "learner";
}

export async function createUniqueUsername(User, fullName) {
  const base = usernameBase(fullName);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${base}.${randomBytes(3).toString("hex")}`;
    if (!(await User.exists({ username: candidate }))) return candidate;
  }
  throw new Error("Could not generate a unique profile username.");
}
