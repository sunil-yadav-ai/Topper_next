import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET = "a".repeat(64);
const { dispatchApiRequest } = await import("../app.js");

function request(path, init = {}) {
  return dispatchApiRequest(new Request(`http://localhost${path}`, init));
}

test("login attempts are limited independently from logout and session refresh", async () => {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const response = await request("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 400);
  }

  const limitedLogin = await request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(limitedLogin.status, 429);

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const logout = await request("/api/auth/logout", { method: "POST" });
    assert.equal(logout.status, 200);

    const session = await request("/api/auth/me");
    assert.equal(session.status, 401);
  }
});
