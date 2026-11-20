import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import Follow from "../models/Follow.js";
import User from "../models/User.js";
import {
  followUser,
  listFollowers,
  listFollowing,
  unfollowUser,
} from "./follow.controller.js";

function createResponse() {
  return { json(payload) { this.payload = payload; } };
}

test("following a student is idempotent and returns the follower count", async () => {
  const follower = new mongoose.Types.ObjectId();
  const followedUser = new mongoose.Types.ObjectId();
  const originalFindOne = User.findOne;
  const originalUpdateOne = Follow.updateOne;
  const originalCountDocuments = Follow.countDocuments;
  let update;
  User.findOne = (filter) => {
    assert.deepEqual(filter, { username: "ada.student", role: "user" });
    return {
      select: async () => ({ _id: followedUser, isSuspended: false }),
    };
  };
  Follow.updateOne = async (...args) => { update = args; };
  Follow.countDocuments = async (filter) => {
    assert.deepEqual(filter, { followedUser });
    return 3;
  };
  const response = createResponse();

  try {
    await followUser(
      { params: { username: "Ada.Student" }, user: { _id: follower } },
      response,
    );
    assert.deepEqual(update[0], { follower, followedUser });
    assert.deepEqual(update[1], { $setOnInsert: { follower, followedUser } });
    assert.equal(response.payload.isFollowing, true);
    assert.equal(response.payload.followerCount, 3);
  } finally {
    User.findOne = originalFindOne;
    Follow.updateOne = originalUpdateOne;
    Follow.countDocuments = originalCountDocuments;
  }
});

test("following self or an admin profile is rejected", async () => {
  const userId = new mongoose.Types.ObjectId();
  const originalFindOne = User.findOne;
  const originalUpdateOne = Follow.updateOne;
  User.findOne = (filter) => ({
    select: async () => ({
      _id: filter.username === "self" ? userId : new mongoose.Types.ObjectId(),
      isSuspended: false,
    }),
  });
  Follow.updateOne = async () => {
    throw new Error("A follow edge must not be written.");
  };

  try {
    await assert.rejects(
      followUser(
        { params: { username: "self" }, user: { _id: userId } },
        createResponse(),
      ),
      { statusCode: 409 },
    );
    User.findOne = () => ({ select: async () => null });
    await assert.rejects(
      followUser(
        { params: { username: "admin.user" }, user: { _id: userId } },
        createResponse(),
      ),
      { statusCode: 404 },
    );
  } finally {
    User.findOne = originalFindOne;
    Follow.updateOne = originalUpdateOne;
  }
});

test("unfollowing removes only the current student's follow edge", async () => {
  const follower = new mongoose.Types.ObjectId();
  const followedUser = new mongoose.Types.ObjectId();
  const originalFindOne = User.findOne;
  const originalDeleteOne = Follow.deleteOne;
  const originalCountDocuments = Follow.countDocuments;
  let deleted;
  User.findOne = () => ({
    select: async () => ({ _id: followedUser, isSuspended: false }),
  });
  Follow.deleteOne = async (filter) => { deleted = filter; };
  Follow.countDocuments = async () => 2;
  const response = createResponse();

  try {
    await unfollowUser(
      { params: { username: "ada.student" }, user: { _id: follower } },
      response,
    );
    assert.deepEqual(deleted, { follower, followedUser });
    assert.equal(response.payload.isFollowing, false);
    assert.equal(response.payload.followerCount, 2);
  } finally {
    User.findOne = originalFindOne;
    Follow.deleteOne = originalDeleteOne;
    Follow.countDocuments = originalCountDocuments;
  }
});

test("follow lists are public, paginated, and preserve edge order", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const firstUserId = new mongoose.Types.ObjectId();
  const secondUserId = new mongoose.Types.ObjectId();
  const originalFindOne = User.findOne;
  const originalFind = User.find;
  const originalFollowFind = Follow.find;
  const originalCountDocuments = Follow.countDocuments;
  const profile = { _id: ownerId, isSuspended: false };
  const userById = new Map([
    [String(firstUserId), { _id: firstUserId, fullName: "First", username: "first.student" }],
    [String(secondUserId), { _id: secondUserId, fullName: "Second", username: "second.student" }],
  ]);
  User.findOne = () => ({ select: async () => profile });
  Follow.countDocuments = async (filter) => {
    assert.deepEqual(filter, { followedUser: ownerId });
    return 2;
  };
  Follow.find = (filter) => {
    assert.deepEqual(filter, { followedUser: ownerId });
    return {
      select(field) {
        assert.equal(field, "follower");
        return this;
      },
      sort(value) {
        assert.deepEqual(value, { createdAt: -1 });
        return this;
      },
      skip(value) {
        assert.equal(value, 0);
        return this;
      },
      limit(value) {
        assert.equal(value, 25);
        return this;
      },
      async lean() {
        return [{ follower: secondUserId }, { follower: firstUserId }];
      },
    };
  };
  User.find = (filter) => {
    assert.deepEqual(filter, {
      _id: { $in: [secondUserId, firstUserId] },
      role: "user",
    });
    return {
      select(fields) {
        assert.equal(fields, "fullName username avatarUrl");
        return this;
      },
      async lean() {
        return [userById.get(String(firstUserId)), userById.get(String(secondUserId))];
      },
    };
  };
  const response = createResponse();

  try {
    await listFollowers(
      {
        params: { username: "ada.student" },
        query: { page: "1", limit: "25" },
      },
      response,
    );
    assert.deepEqual(
      response.payload.users.map(({ id }) => id),
      [String(secondUserId), String(firstUserId)],
    );
    assert.deepEqual(response.payload.pagination, {
      page: 1,
      limit: 25,
      total: 2,
      pages: 1,
    });
  } finally {
    User.findOne = originalFindOne;
    User.find = originalFind;
    Follow.find = originalFollowFind;
    Follow.countDocuments = originalCountDocuments;
  }
});

test("the following list returns students the owner follows", async () => {
  const ownerId = new mongoose.Types.ObjectId();
  const followedUserId = new mongoose.Types.ObjectId();
  const originalFindOne = User.findOne;
  const originalFind = User.find;
  const originalFollowFind = Follow.find;
  const originalCountDocuments = Follow.countDocuments;
  User.findOne = () => ({
    select: async () => ({ _id: ownerId, isSuspended: false }),
  });
  Follow.countDocuments = async (filter) => {
    assert.deepEqual(filter, { follower: ownerId });
    return 1;
  };
  Follow.find = (filter) => {
    assert.deepEqual(filter, { follower: ownerId });
    return {
      select(field) {
        assert.equal(field, "followedUser");
        return this;
      },
      sort() { return this; },
      skip() { return this; },
      limit() { return this; },
      async lean() { return [{ followedUser: followedUserId }]; },
    };
  };
  User.find = () => ({
    select() { return this; },
    async lean() {
      return [{
        _id: followedUserId,
        fullName: "Ada Student",
        username: "ada.student",
      }];
    },
  });
  const response = createResponse();

  try {
    await listFollowing(
      { params: { username: "owner.student" } },
      response,
    );
    assert.equal(response.payload.users[0].id, String(followedUserId));
    assert.equal(response.payload.users[0].username, "ada.student");
  } finally {
    User.findOne = originalFindOne;
    User.find = originalFind;
    Follow.find = originalFollowFind;
    Follow.countDocuments = originalCountDocuments;
  }
});
