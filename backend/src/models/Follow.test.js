import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import Follow from "./Follow.js";

test("follow edges require both users and are unique per follower pair", () => {
  const follow = new Follow({
    follower: new mongoose.Types.ObjectId(),
    followedUser: new mongoose.Types.ObjectId(),
  });
  assert.equal(follow.validateSync(), undefined);
  assert.ok(
    Follow.schema.indexes().some(
      ([fields, options]) =>
        fields.follower === 1 &&
        fields.followedUser === 1 &&
        options.unique,
    ),
  );
});
