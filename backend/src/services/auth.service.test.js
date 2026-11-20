import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET = "a".repeat(64);
const {
  createActionToken,
  createEmailVerificationCode,
  authTokenLifetimeMs,
  getAuthCookieOptions,
  hashEmailVerificationCode,
  hashActionToken,
  legacyAuthCookiePath,
  signAuthToken,
  validatePassword,
  verifyAuthToken,
} = await import("./auth.service.js");

test("signs 30-day tokens with the current user version but no role claim", () => {
  const token = signAuthToken({
    id: "student-123",
    role: "user",
    authVersion: 4,
  });
  const payload = verifyAuthToken(token);

  assert.equal(payload.sub, "student-123");
  assert.equal(Object.hasOwn(payload, "role"), false);
  assert.equal(payload.ver, 4);
  assert.equal(payload.exp - payload.iat, 30 * 24 * 60 * 60);
  assert.equal(authTokenLifetimeMs, 30 * 24 * 60 * 60 * 1000);
  assert.throws(() => verifyAuthToken(`${token.slice(0, -1)}x`));
});

test("generates one-time action tokens and only stores their digest", () => {
  const token = createActionToken();

  assert.match(token, /^[a-f0-9]{64}$/);
  assert.notEqual(hashActionToken(token), token);
  assert.equal(hashActionToken(token).length, 64);
});

test("generates six-digit email codes and hashes them with normalized email", () => {
  const code = createEmailVerificationCode();
  assert.match(code, /^\d{6}$/);
  assert.equal(
    hashEmailVerificationCode(" ADA@EXAMPLE.COM ", code),
    hashEmailVerificationCode("ada@example.com", code),
  );
  assert.notEqual(
    hashEmailVerificationCode("ada@example.com", code),
    hashEmailVerificationCode("ada@example.com", "000000"),
  );
});

test("enforces bcrypt's UTF-8 byte limit and secure cookie attributes", () => {
  assert.equal(validatePassword("password"), true);
  assert.equal(validatePassword("short"), false);
  assert.equal(validatePassword("😀".repeat(18)), true);
  assert.equal(validatePassword("😀".repeat(19)), false);
  assert.equal(validatePassword(null), false);

  const cookie = getAuthCookieOptions();
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.sameSite, "lax");
  assert.equal(cookie.path, "/api");
  assert.equal(cookie.maxAge, authTokenLifetimeMs);
  assert.equal(legacyAuthCookiePath, "/api/auth");
});
