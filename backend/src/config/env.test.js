import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import {
  isAllowedCorsOrigin,
  parseMongoDnsServers,
  resolveBackendEnvPath,
  shouldConfigureMongoDns,
} from "./env.js";

test("resolves backend .env from the Next.js frontend working directory", () => {
  const root = mkdtempSync(join(tmpdir(), "topper-env-"));
  const envPath = resolve(root, "backend", ".env");
  try {
    mkdirSync(dirname(envPath), { recursive: true });
    mkdirSync(resolve(root, "frontend"));
    writeFileSync(envPath, "MONGODB_DNS_SERVERS=8.8.8.8\n");

    assert.equal(resolveBackendEnvPath(resolve(root, "frontend")), envPath);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("parses optional MongoDB DNS server IP addresses", () => {
  assert.deepEqual(parseMongoDnsServers(undefined), []);
  assert.deepEqual(
    parseMongoDnsServers("8.8.8.8, 2001:4860:4860::8888"),
    ["8.8.8.8", "2001:4860:4860::8888"],
  );
  assert.throws(
    () => parseMongoDnsServers("dns.google"),
    /only IPv4 or IPv6 addresses/,
  );
});

test("only configures custom DNS for MongoDB SRV URIs", () => {
  assert.equal(shouldConfigureMongoDns("mongodb+srv://cluster.example/db"), true);
  assert.equal(shouldConfigureMongoDns("mongodb://host.example/db"), false);
});

test("allows configured browser origins and loopback aliases", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const allowedOrigins = ["http://localhost:3000", "http://localhost:3001"];
  try {
    process.env.NODE_ENV = "production";
    assert.equal(isAllowedCorsOrigin("http://localhost:3000", allowedOrigins), true);
    assert.equal(isAllowedCorsOrigin("http://127.0.0.1:3000", allowedOrigins), true);
    assert.equal(isAllowedCorsOrigin("http://localhost:3001", allowedOrigins), true);
    assert.equal(isAllowedCorsOrigin("http://127.0.0.1:3001", allowedOrigins), true);
    assert.equal(isAllowedCorsOrigin("http://localhost:3002", allowedOrigins), false);
    assert.equal(isAllowedCorsOrigin("https://example.com", allowedOrigins), false);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});

test("does not allow unconfigured loopback ports in development or production", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "development";
    assert.equal(isAllowedCorsOrigin("http://localhost:3002", ["http://localhost:3000"]), false);
    process.env.NODE_ENV = "production";
    assert.equal(isAllowedCorsOrigin("http://localhost:3002", ["http://localhost:3000"]), false);
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
  }
});
