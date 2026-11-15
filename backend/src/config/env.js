import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { getServers, setServers } from "node:dns";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function resolveBackendEnvPath(cwd = process.cwd()) {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(cwd, "backend", ".env"),
    resolve(cwd, "..", "backend", ".env"),
    resolve(cwd, ".env"),
    resolve(moduleDirectory, "../../.env"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[3];
}

dotenv.config({
  path: resolveBackendEnvPath(),
});

const mongodbUri =
  process.env.MONGODB_URI ??
  "mongodb://127.0.0.1:27017/student_resource_sharing";

export function shouldConfigureMongoDns(uri) {
  return /^mongodb\+srv:\/\//i.test(uri);
}

export function parseMongoDnsServers(value) {
  if (value == null) return [];
  if (typeof value !== "string") {
    throw new Error("MONGODB_DNS_SERVERS must be a comma-separated list of IP addresses.");
  }
  if (value.trim() === "") return [];

  const servers = value.split(",").map((server) => server.trim()).filter(Boolean);
  if (servers.some((server) => isIP(server) === 0)) {
    throw new Error("MONGODB_DNS_SERVERS must contain only IPv4 or IPv6 addresses.");
  }
  return servers;
}

const usesMongoSrv = shouldConfigureMongoDns(mongodbUri);
const mongodbDnsServers = usesMongoSrv
  ? parseMongoDnsServers(process.env.MONGODB_DNS_SERVERS)
  : [];
const dnsServersKey = Symbol.for("topper.mongodb.dns-servers");
const previouslyConfiguredDnsServers = globalThis[dnsServersKey];

if (mongodbDnsServers.length) {
  if (
    previouslyConfiguredDnsServers &&
    JSON.stringify(previouslyConfiguredDnsServers) !== JSON.stringify(mongodbDnsServers)
  ) {
    throw new Error("MONGODB_DNS_SERVERS cannot change after DNS configuration.");
  }
  if (!previouslyConfiguredDnsServers) {
    try {
      setServers(mongodbDnsServers);
    } catch (error) {
      throw new Error(
        "Could not apply MONGODB_DNS_SERVERS. Configure DNS at the operating-system or hosting level instead.",
        { cause: error },
      );
    }
    globalThis[dnsServersKey] = mongodbDnsServers;
  }
}

console.info("[mongodb-dns] Node DNS resolver configuration loaded.", {
  srvResolutionEnabled: usesMongoSrv,
  configured: mongodbDnsServers.length > 0,
  servers: getServers(),
});

export const env = {
  mongodbUri,
  mongodbDnsServers,
  corsOrigins: (process.env.CORS_ORIGIN ??
    "http://localhost:3000,http://127.0.0.1:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  frontendUrl: process.env.FRONTEND_URL ?? "http://localhost:3000",
  jwtSecret: process.env.JWT_SECRET ?? "",
  smtpHost: process.env.SMTP_HOST ?? "smtp.gmail.com",
  smtpPort: Number.parseInt(process.env.SMTP_PORT ?? "587", 10),
  smtpSecure: process.env.SMTP_SECURE === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPassword: process.env.SMTP_PASSWORD ?? "",
  emailFrom: process.env.EMAIL_FROM ?? "",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiOcrModel: process.env.GEMINI_OCR_MODEL ?? "",
  geminiSyllabusModel: process.env.GEMINI_SYLLABUS_MODEL ?? "",
  geminiVerificationModel: process.env.GEMINI_VERIFICATION_MODEL ?? "",
  geminiTutorModel: process.env.GEMINI_TUTOR_MODEL ?? "",
  geminiVerificationUseGoogleSearch:
    process.env.GEMINI_VERIFICATION_USE_GOOGLE_SEARCH === "true",
  geminiUserDailyRequestLimit: Number.parseInt(
    process.env.GEMINI_USER_DAILY_REQUEST_LIMIT ?? "100",
    10,
  ),
  geminiUserMinuteRequestLimit: Number.parseInt(
    process.env.GEMINI_USER_MINUTE_REQUEST_LIMIT ?? "30",
    10,
  ),
  academicReferenceDomains: (process.env.ACADEMIC_REFERENCE_DOMAINS ??
    "openstax.org,nist.gov,mathworld.wolfram.com,chem.libretexts.org,physicsclassroom.com,khanacademy.org")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean),
  minimumVerifiableStatements: Number.parseInt(
    process.env.MIN_VERIFIABLE_STATEMENTS ?? "5",
    10,
  ),
  ocrEncryptionKey: process.env.OCR_ENCRYPTION_KEY ?? "",
  rewardBudgetPoints: Number.parseInt(
    process.env.REWARD_BUDGET_POINTS ?? "10000",
    10,
  ),
  rewardPoints: {
    handwrittenNote: Number.parseInt(
      process.env.REWARD_POINTS_HANDWRITTEN_NOTE ?? "10",
      10,
    ),
    pyq: Number.parseInt(process.env.REWARD_POINTS_PYQ ?? "8", 10),
    verifiedCorrection: Number.parseInt(
      process.env.REWARD_POINTS_VERIFIED_CORRECTION ?? "5",
      10,
    ),
    highQualityResource: Number.parseInt(
      process.env.REWARD_POINTS_HIGH_QUALITY_RESOURCE ?? "15",
      10,
    ),
  },
};

export function isAllowedCorsOrigin(origin, allowedOrigins = env.corsOrigins) {
  if (allowedOrigins.includes(origin)) return true;

  let requested;
  try {
    requested = new URL(origin);
  } catch {
    return false;
  }

  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!loopbackHosts.has(requested.hostname)) {
    return false;
  }

  const aliases = {
    localhost: new Set(["localhost", "127.0.0.1", "[::1]"]),
    "127.0.0.1": new Set(["localhost", "127.0.0.1", "[::1]"]),
    "[::1]": new Set(["localhost", "127.0.0.1", "[::1]"]),
  };
  return allowedOrigins.some((allowedOrigin) => {
    try {
      const allowed = new URL(allowedOrigin);
      return (
        aliases[requested.hostname].has(allowed.hostname) &&
        allowed.protocol === requested.protocol &&
        allowed.port === requested.port
      );
    } catch {
      return false;
    }
  });
}

if (!Number.isInteger(env.smtpPort) || env.smtpPort < 1 || env.smtpPort > 65535) {
  throw new Error("SMTP_PORT must be an integer between 1 and 65535.");
}

if (
  !Number.isInteger(env.minimumVerifiableStatements) ||
  env.minimumVerifiableStatements < 1
) {
  throw new Error("MIN_VERIFIABLE_STATEMENTS must be a positive integer.");
}

for (const [name, limit] of Object.entries({
  GEMINI_USER_DAILY_REQUEST_LIMIT: env.geminiUserDailyRequestLimit,
  GEMINI_USER_MINUTE_REQUEST_LIMIT: env.geminiUserMinuteRequestLimit,
})) {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new Error(`${name} must be a positive safe integer.`);
  }
}

if (!Number.isSafeInteger(env.rewardBudgetPoints) || env.rewardBudgetPoints < 0) {
  throw new Error("REWARD_BUDGET_POINTS must be a non-negative safe integer.");
}

for (const [name, points] of Object.entries(env.rewardPoints)) {
  if (!Number.isSafeInteger(points) || points < 0) {
    throw new Error(`Reward point setting ${name} must be a non-negative safe integer.`);
  }
}
