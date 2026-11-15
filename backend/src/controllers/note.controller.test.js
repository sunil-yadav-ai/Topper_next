import assert from "node:assert/strict";
import test from "node:test";
import Note from "../models/Note.js";
import { getPublishedNotes } from "./note.controller.js";

test("published note subject counts include all verification outcomes in the student's department", async () => {
  const originalAggregate = Note.aggregate;
  const filter = {
    department: { $regex: "^CSE$", $options: "i" },
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  };
  Note.aggregate = async (pipeline) => {
    assert.deepEqual(pipeline[0], { $match: filter });
    return [
      { _id: { subject: "Data Structures", semester: 3 }, count: 2 },
      { _id: { subject: "Operating Systems", semester: 5 }, count: 1 },
    ];
  };
  const response = { json(payload) { this.payload = payload; } };

  try {
    await getPublishedNotes({
      user: { department: "CSE" },
      query: { subjectsOnly: "true" },
    }, response);
    assert.deepEqual(response.payload.subjects, ["Data Structures", "Operating Systems"]);
    assert.deepEqual(response.payload.subjectStats, {
      "Data Structures": { count: 2, semesters: [3] },
      "Operating Systems": { count: 1, semesters: [5] },
    });
  } finally {
    Note.aggregate = originalAggregate;
  }
});

test("published notes include safe uploader details and support pagination", async () => {
  const originalFind = Note.find;
  const originalCountDocuments = Note.countDocuments;
  const filter = {
    department: { $regex: "^CSE$", $options: "i" },
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
    subject: { $regex: "^Computer Graphics$", $options: "i" },
  };
  const note = {
    _id: { toString: () => "note-id" },
    title: "Rendering basics",
    description: "Class notes",
    department: "CSE",
    batch: "2025",
    semester: 5,
    subject: "Computer Graphics",
    unit: "Unit 1",
    topic: "Rendering",
    storage: { format: "pdf", bytes: 1024 },
    uploadedBy: {
      _id: { toString: () => "student-id" },
      fullName: "Ada Student",
      username: "ada.student",
      avatarUrl: "",
      email: "private@example.com",
    },
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
  const query = {
    populate(path, fields) {
      assert.equal(path, "uploadedBy");
      assert.equal(fields, "fullName username avatarUrl");
      return this;
    },
    sort(value) {
      assert.deepEqual(value, { createdAt: -1 });
      return this;
    },
    skip(value) {
      assert.equal(value, 50);
      return this;
    },
    limit(value) {
      assert.equal(value, 50);
      return this;
    },
    async lean() { return [note]; },
  };
  Note.find = (actualFilter) => {
    assert.deepEqual(actualFilter, filter);
    return query;
  };
  Note.countDocuments = async (actualFilter) => {
    assert.deepEqual(actualFilter, filter);
    return 74;
  };
  const response = { json(payload) { this.payload = payload; } };

  try {
    await getPublishedNotes({
      user: { department: "CSE" },
      query: { subject: "Computer Graphics", page: "2", limit: "50" },
      baseUrl: "/api/notes",
    }, response);
    assert.equal(response.payload.notes[0].uploadedBy.username, "ada.student");
    assert.equal(response.payload.notes[0].uploadedBy.avatarUrl, "");
    assert.equal(JSON.stringify(response.payload).includes("private@example.com"), false);
    assert.deepEqual(response.payload.pagination, { page: 2, limit: 50, total: 74, pages: 2 });
  } finally {
    Note.find = originalFind;
    Note.countDocuments = originalCountDocuments;
  }
});
