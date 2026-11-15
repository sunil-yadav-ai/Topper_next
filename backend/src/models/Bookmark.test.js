import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import Bookmark from "./Bookmark.js";
import StudentResourceAccess from "./StudentResourceAccess.js";

test("bookmark defaults to the Saved folder and validates resource types", () => {
  const bookmark = new Bookmark({
    user: new mongoose.Types.ObjectId(),
    resourceType: "note",
    resource: new mongoose.Types.ObjectId(),
  });
  assert.equal(bookmark.folder, "Saved");
  assert.equal(bookmark.validateSync(), undefined);
  assert.ok(
    new Bookmark({
      user: new mongoose.Types.ObjectId(),
      resourceType: "other",
      resource: new mongoose.Types.ObjectId(),
    }).validateSync().errors.resourceType,
  );
  assert.ok(
    new Bookmark({
      user: new mongoose.Types.ObjectId(),
      resourceType: "note",
      resource: new mongoose.Types.ObjectId(),
      folder: "a".repeat(61),
    }).validateSync().errors.folder,
  );
});

test("resource access stores recent and download history", () => {
  const entry = new StudentResourceAccess({
    user: new mongoose.Types.ObjectId(),
    resourceType: "pyq",
    resource: new mongoose.Types.ObjectId(),
    lastAccessedAt: new Date(),
    lastDownloadedAt: new Date(),
    downloadCount: 1,
  });
  assert.equal(entry.validateSync(), undefined);
  assert.equal(StudentResourceAccess.schema.indexes().length, 4);
});
