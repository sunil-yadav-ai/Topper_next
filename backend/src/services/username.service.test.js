import assert from "node:assert/strict";
import test from "node:test";
import {
  createUniqueUsername,
  normalizeUsername,
  usernamePattern,
} from "./username.service.js";

test("normalizes and validates public usernames", () => {
  assert.equal(normalizeUsername(" Ada.Student "), "ada.student");
  assert.equal(usernamePattern.test("ada.student"), true);
  assert.equal(usernamePattern.test("a"), false);
  assert.equal(usernamePattern.test(".invalid"), false);
  assert.equal(usernamePattern.test("invalid-username"), false);
});

test("creates a unique username from the account name", async () => {
  const checked = [];
  const username = await createUniqueUsername(
    { async exists(query) { checked.push(query.username); return false; } },
    "Ada Student",
  );
  assert.match(username, /^ada\.student\.[a-f0-9]{6}$/);
  assert.equal(checked[0], username);
});
