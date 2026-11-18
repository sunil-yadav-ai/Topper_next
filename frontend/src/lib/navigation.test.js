import assert from "node:assert/strict";
import test from "node:test";
import { getPublicResourcePath } from "./navigation.js";

test("question papers use the authenticated resource viewer", () => {
  assert.equal(
    getPublicResourcePath({ id: "paper-id", type: "pyq" }),
    "/resources/pyq/paper-id",
  );
});

test("notes keep their public resource path", () => {
  assert.equal(
    getPublicResourcePath({ id: "note-id", type: "note", title: "Graph Theory Notes" }),
    "/notes/note-id/graph-theory-notes",
  );
});
