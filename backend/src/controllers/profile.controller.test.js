import assert from "node:assert/strict";
import test from "node:test";
import User from "../models/User.js";
import Note from "../models/Note.js";
import Pyq from "../models/Pyq.js";
import {
  getPublicProfile,
  searchPublicProfiles,
  updateOwnProfile,
} from "./profile.controller.js";

test("public profile search matches names and usernames without exposing private fields", async () => {
  const originalFind = User.find;
  const matchingUser = {
    _id: { toString: () => "user-id" },
    fullName: "Ada Student",
    username: "ada.student",
    avatarUrl: "https://images.example.com/ada.png",
    email: "private@example.com",
    password: "must-not-appear",
  };
  let filter;
  User.find = (query) => {
    filter = query;
    return {
      select(fields) {
        assert.equal(fields, "fullName username avatarUrl");
        return this;
      },
      sort(value) {
        assert.deepEqual(value, { fullName: 1 });
        return this;
      },
      limit(value) {
        assert.equal(value, 20);
        return this;
      },
      async lean() {
        return [matchingUser];
      },
    };
  };

  const response = { json(payload) { this.payload = payload; } };
  try {
    await searchPublicProfiles({ query: { q: "ada" } }, response);
    assert.deepEqual(filter.$or.map((entry) => Object.keys(entry)[0]), ["fullName", "username"]);
    assert.equal(filter.$or[0].fullName.source, "ada");
    assert.equal(filter.$or[0].fullName.flags, "i");
    assert.equal(response.payload.users[0].fullName, "Ada Student");
    assert.equal(response.payload.users[0].username, "ada.student");
    assert.equal(JSON.stringify(response.payload).includes(matchingUser.email), false);
    assert.equal(JSON.stringify(response.payload).includes(matchingUser.password), false);
  } finally {
    User.find = originalFind;
  }
});

test("public profile search escapes regex input and accepts @usernames", async () => {
  const originalFind = User.find;
  let filter;
  User.find = (query) => {
    filter = query;
    return {
      select() { return this; },
      sort() { return this; },
      limit() { return this; },
      async lean() { return []; },
    };
  };

  try {
    await searchPublicProfiles({ query: { q: "@ada.*" } }, { json() {} });
    assert.equal(filter.$or[0].fullName.source, "ada\\.\\*");
    assert.equal(filter.$or[1].username.source, "ada\\.\\*");
  } finally {
    User.find = originalFind;
  }
});

test("public profile search skips short queries and rejects oversized or repeated queries", async () => {
  const originalFind = User.find;
  User.find = () => {
    throw new Error("A query should not run.");
  };
  const response = { json(payload) { this.payload = payload; } };

  try {
    await searchPublicProfiles({ query: { q: "a" } }, response);
    assert.deepEqual(response.payload.users, []);
    await assert.rejects(
      searchPublicProfiles({ query: { q: "a".repeat(51) } }, response),
      { statusCode: 400 },
    );
    await assert.rejects(
      searchPublicProfiles({ query: { q: ["ada", "student"] } }, response),
      { statusCode: 400 },
    );
  } finally {
    User.find = originalFind;
  }
});

test("public profile exposes only safe fields and published contributions", async () => {
  const originalFindOne = User.findOne;
  const originalNoteFind = Note.find;
  const originalNoteCount = Note.countDocuments;
  const originalPyqFind = Pyq.find;
  const originalPyqCount = Pyq.countDocuments;
  const user = {
    _id: { toString: () => "user-id" },
    fullName: "Ada Student",
    username: "ada.student",
    bio: "Learning every day.",
    college: "Example College",
    university: "Example University",
    course: "Computer Science",
    department: "Engineering",
    avatarUrl: "https://images.example.com/ada.png",
    coverImage: "https://images.example.com/cover.jpg",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    role: "user",
    email: "private@example.com",
    password: "must-not-appear",
  };
  const noteFilter = {
    uploadedBy: user._id,
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  };
  const pyqFilter = {
    uploadedBy: user._id,
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  };
  const makeQuery = (result) => ({
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    async lean() { return result; },
  });
  User.findOne = () => ({
    select: async (fields) => {
      assert.match(fields, /\bavatarUrl\b/);
      assert.match(fields, /\bcoverImage\b/);
      return user;
    },
  });
  Note.find = (filter) => {
    assert.deepEqual(filter, noteFilter);
    return makeQuery([]);
  };
  Note.countDocuments = async (filter) => {
    assert.deepEqual(filter, noteFilter);
    return 0;
  };
  Pyq.find = (filter) => {
    assert.deepEqual(filter, pyqFilter);
    return makeQuery([]);
  };
  Pyq.countDocuments = async (filter) => {
    assert.deepEqual(filter, pyqFilter);
    return 0;
  };

  const response = { json(payload) { this.payload = payload; } };
  try {
    await getPublicProfile({ params: { username: "Ada.Student" } }, response);
    const serialized = JSON.stringify(response.payload);
    assert.equal(response.payload.profile.username, "ada.student");
    assert.equal(response.payload.profile.role, "user");
    assert.equal(response.payload.profile.avatarUrl, user.avatarUrl);
    assert.equal(response.payload.profile.coverImage, user.coverImage);
    assert.equal(serialized.includes(user.email), false);
    assert.equal(serialized.includes(user.password), false);
  } finally {
    User.findOne = originalFindOne;
    Note.find = originalNoteFind;
    Note.countDocuments = originalNoteCount;
    Pyq.find = originalPyqFind;
    Pyq.countDocuments = originalPyqCount;
  }
});

test("public profiles can be opened by uploader ID", async () => {
  const originalFindOne = User.findOne;
  const originalFindById = User.findById;
  const originalNoteFind = Note.find;
  const originalNoteCount = Note.countDocuments;
  const originalPyqFind = Pyq.find;
  const originalPyqCount = Pyq.countDocuments;
  const userId = "507f1f77bcf86cd799439011";
  const user = {
    _id: userId,
    fullName: "Ada Student",
    username: "ada.student",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    role: "user",
  };
  const makeQuery = (result) => ({
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    async lean() { return result; },
  });
  User.findOne = (filter) => {
    assert.deepEqual(filter, { username: userId });
    return { select: async () => null };
  };
  User.findById = (id) => {
    assert.equal(id, userId);
    return { select: async () => user };
  };
  Note.find = () => makeQuery([]);
  Note.countDocuments = async () => 0;
  Pyq.find = () => makeQuery([]);
  Pyq.countDocuments = async () => 0;

  const response = { json(payload) { this.payload = payload; } };
  try {
    await getPublicProfile({ params: { username: userId } }, response);
    assert.equal(response.payload.profile.id, userId);
    assert.equal(response.payload.profile.username, user.username);
  } finally {
    User.findOne = originalFindOne;
    User.findById = originalFindById;
    Note.find = originalNoteFind;
    Note.countDocuments = originalNoteCount;
    Pyq.find = originalPyqFind;
    Pyq.countDocuments = originalPyqCount;
  }
});

test("profile updates reject role and email changes", async () => {
  await assert.rejects(
    updateOwnProfile(
      { body: { role: "admin" }, user: { _id: "user-id" } },
      {},
    ),
    { statusCode: 400 },
  );
  await assert.rejects(
    updateOwnProfile(
      { body: { email: "other@example.com" }, user: { _id: "user-id" } },
      {},
    ),
    { statusCode: 400 },
  );
});

test("profile edits allow an empty optional course field", async () => {
  const originalFindById = User.findById;
  const originalExists = User.exists;
  const user = {
    _id: "user-id",
    fullName: "Ada Student",
    username: "ada.student",
    bio: "",
    college: "Example College",
    course: "Computer Science",
    avatarPublicId: undefined,
    async save() {},
    toSafeObject() {
      return {
        id: this._id,
        fullName: this.fullName,
        username: this.username,
        course: this.course,
      };
    },
  };
  User.findById = () => ({ select: async () => user });
  User.exists = async () => false;
  const response = { json(payload) { this.payload = payload; } };
  try {
    await updateOwnProfile(
      {
        user: { _id: "user-id" },
        body: {
          fullName: "Ada Newname",
          username: "ada.newname",
          bio: "",
          college: "Example College",
          course: "",
        },
      },
      response,
    );
    assert.equal(response.payload.profile.fullName, "Ada Newname");
    assert.equal(response.payload.profile.course, "");
  } finally {
    User.findById = originalFindById;
    User.exists = originalExists;
  }
});
