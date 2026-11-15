import assert from "node:assert/strict";
import test from "node:test";
import { dispatchApiRequest } from "./app.js";
import { env } from "./config/env.js";

test("Next route dispatch handles preflight requests with allowed CORS headers", async () => {
  const response = await dispatchApiRequest(
    new Request("http://localhost/api/auth/login", {
      method: "OPTIONS",
      headers: {
        Origin: env.corsOrigins[0],
        "Access-Control-Request-Headers": "content-type",
      },
    }),
  );

  assert.equal(response.status, 204);
  assert.equal(
    response.headers.get("access-control-allow-origin"),
    env.corsOrigins[0],
  );
  assert.equal(response.headers.get("access-control-allow-credentials"), "true");
  assert.equal(response.headers.get("access-control-allow-headers"), "content-type");
});

test("unmatched API paths return the standard JSON not-found response", async () => {
  const response = await dispatchApiRequest(
    new Request("http://localhost/api/not-a-route"),
  );

  assert.equal(response.status, 404);
  assert.match(response.headers.get("content-type"), /application\/json/i);
  assert.match((await response.json()).message, /Route not found/);
});
