import assert from "node:assert/strict";
import test from "node:test";
import { updateStudentProfile } from "./dashboard.controller.js";

test("profile updates reject attempts to change the role", async () => {
  await assert.rejects(
    updateStudentProfile(
      { body: { role: "admin" }, user: { role: "user" } },
      {},
    ),
    { statusCode: 400 },
  );
});
