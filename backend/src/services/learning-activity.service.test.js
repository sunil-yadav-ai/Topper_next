import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import DailyLearningActivity from "../models/DailyLearningActivity.js";
import LearningActivity from "../models/LearningActivity.js";
import Note from "../models/Note.js";
import Pyq from "../models/Pyq.js";
import {
  addCalendarDays,
  getActivityDateKey,
  getStudentActivitySummary,
  recordSuccessfulResourceOpen,
} from "./learning-activity.service.js";

test("activity dates use Asia/Kolkata across UTC midnight boundaries", () => {
  assert.equal(getActivityDateKey(new Date("2026-11-09T18:29:00.000Z")), "2026-11-09");
  assert.equal(getActivityDateKey(new Date("2026-11-09T18:30:00.000Z")), "2026-11-10");
  assert.equal(addCalendarDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addCalendarDays("2028-02-28", 1), "2028-02-29");
});

test("daily activity aggregates remain unique per student and local calendar date", () => {
  const indexes = DailyLearningActivity.schema.indexes();
  assert.ok(indexes.some(([fields, options]) =>
    fields.userId === 1 && fields.activityDate === 1 && options.unique));
  const eventIndexes = LearningActivity.schema.indexes();
  assert.ok(eventIndexes.some(([fields]) =>
    fields.userId === 1 && fields.activityDate === -1));
  assert.ok(eventIndexes.some(([fields, options]) =>
    fields.userId === 1 && fields.openId === 1 && options.unique));
  assert.equal(new DailyLearningActivity({
    userId: new mongoose.Types.ObjectId(),
    activityDate: "2026-11-09",
    totalResourcesOpened: 5,
    notesOpened: 4,
    pyqsOpened: 1,
    lastOpenedAt: new Date(),
  }).validateSync(), undefined);
});

test("successful note and PYQ opens create events and increment one daily aggregate", async () => {
  const studentId = new mongoose.Types.ObjectId();
  const resourceId = new mongoose.Types.ObjectId();
  const originals = {
    noteFindById: Note.findById,
    pyqFindById: Pyq.findById,
    eventCreate: LearningActivity.create,
    dailyUpdate: DailyLearningActivity.findOneAndUpdate,
  };
  const events = [];
  const dailyUpdates = [];
  const note = {
    _id: resourceId,
    title: "Python loops",
    publicationStatus: "published",
    visibility: "public",
    uploadedBy: { equals: () => false },
  };
  const pyq = {
    _id: resourceId,
    title: "",
    subject: "Python",
    examinationYear: 2025,
    examType: "Final",
    publicationStatus: "published",
    visibility: "public",
    uploadedBy: { equals: () => false },
  };
  Note.findById = () => ({ select: async () => note });
  Pyq.findById = () => ({ select: async () => pyq });
  LearningActivity.create = async (data) => {
    const event = { ...data, _id: new mongoose.Types.ObjectId() };
    events.push(event);
    return event;
  };
  DailyLearningActivity.findOneAndUpdate = async (filter, update, options) => {
    dailyUpdates.push({ filter, update, options });
    return {};
  };

  try {
    const noteResult = await recordSuccessfulResourceOpen({
      userId: studentId,
      resourceType: "note",
      resourceId,
      openId: "550e8400-e29b-41d4-a716-446655440000",
    });
    const pyqResult = await recordSuccessfulResourceOpen({
      userId: studentId,
      resourceType: "pyq",
      resourceId,
      openId: "550e8400-e29b-41d4-a716-446655440001",
    });
    assert.equal(events.length, 2);
    assert.equal(events[0].userId, studentId);
    assert.equal(events[0].resourceId, resourceId);
    assert.equal(events[0].resourceTitle, "Python loops");
    assert.match(events[0].activityDate, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(noteResult.activityDate, pyqResult.activityDate);
    assert.equal(pyqResult.resourceTitle, "Python - 2025 Final");
    assert.equal(dailyUpdates.length, 2);
    assert.deepEqual(dailyUpdates[0].update.$inc, {
      totalResourcesOpened: 1,
      notesOpened: 1,
    });
    assert.deepEqual(dailyUpdates[1].update.$inc, {
      totalResourcesOpened: 1,
      pyqsOpened: 1,
    });
    assert.equal(dailyUpdates[0].filter.activityDate, dailyUpdates[1].filter.activityDate);
    assert.equal(dailyUpdates[0].options.upsert, true);
  } finally {
    Note.findById = originals.noteFindById;
    Pyq.findById = originals.pyqFindById;
    LearningActivity.create = originals.eventCreate;
    DailyLearningActivity.findOneAndUpdate = originals.dailyUpdate;
  }
});

test("activity open retries with the same id do not increase daily resource totals twice", async () => {
  const studentId = new mongoose.Types.ObjectId();
  const resourceId = new mongoose.Types.ObjectId();
  const openId = "550e8400-e29b-41d4-a716-446655440002";
  const originals = {
    noteFindById: Note.findById,
    eventCreate: LearningActivity.create,
    eventFindOne: LearningActivity.findOne,
    dailyUpdate: DailyLearningActivity.findOneAndUpdate,
  };
  const existing = {
    _id: new mongoose.Types.ObjectId(),
    activityDate: "2026-11-09",
    resourceTitle: "Python loops",
    resourceType: "note",
  };
  Note.findById = () => ({
    select: async () => ({
      _id: resourceId,
      title: "Python loops",
      publicationStatus: "published",
      visibility: "public",
      uploadedBy: { equals: () => false },
    }),
  });
  LearningActivity.create = async () => {
    const error = new Error("Duplicate activity open.");
    error.code = 11000;
    throw error;
  };
  LearningActivity.findOne = () => ({ lean: async () => existing });
  let dailyUpdateCount = 0;
  DailyLearningActivity.findOneAndUpdate = async () => {
    dailyUpdateCount += 1;
  };

  try {
    const result = await recordSuccessfulResourceOpen({
      userId: studentId,
      resourceType: "note",
      resourceId,
      openId,
    });
    assert.deepEqual(result, {
      activityDate: existing.activityDate,
      resourceTitle: existing.resourceTitle,
      resourceType: existing.resourceType,
    });
    assert.equal(dailyUpdateCount, 0);
  } finally {
    Note.findById = originals.noteFindById;
    LearningActivity.create = originals.eventCreate;
    LearningActivity.findOne = originals.eventFindOne;
    DailyLearningActivity.findOneAndUpdate = originals.dailyUpdate;
  }
});

test("activity writes reject invalid resource types and IDs", async () => {
  await assert.rejects(
    recordSuccessfulResourceOpen({
      userId: new mongoose.Types.ObjectId(),
      resourceType: "other",
      resourceId: new mongoose.Types.ObjectId(),
    }),
    { statusCode: 400 },
  );
  await assert.rejects(
    recordSuccessfulResourceOpen({
      userId: new mongoose.Types.ObjectId(),
      resourceType: "note",
      resourceId: "bad-id",
    }),
    { statusCode: 400 },
  );
});

test("private resources cannot be recorded by another student", async () => {
  const originalFindById = Note.findById;
  const originalCreate = LearningActivity.create;
  let eventCreated = false;
  Note.findById = () => ({
    select: async () => ({
      _id: new mongoose.Types.ObjectId(),
      title: "Private note",
      publicationStatus: "published",
      visibility: "private",
      uploadedBy: { equals: () => false },
    }),
  });
  LearningActivity.create = async () => {
    eventCreated = true;
  };
  try {
    await assert.rejects(
      recordSuccessfulResourceOpen({
        userId: new mongoose.Types.ObjectId(),
        resourceType: "note",
        resourceId: new mongoose.Types.ObjectId(),
        openId: "550e8400-e29b-41d4-a716-446655440003",
      }),
      { statusCode: 404 },
    );
    assert.equal(eventCreated, false);
  } finally {
    Note.findById = originalFindById;
    LearningActivity.create = originalCreate;
  }
});

test("heatmap derives past absences but keeps today incomplete and dates before joining untracked", async () => {
  const originalFind = DailyLearningActivity.find;
  DailyLearningActivity.find = () => ({
    sort() {
      return this;
    },
    lean: async () => [
      {
        activityDate: "2026-11-06",
        totalResourcesOpened: 2,
        notesOpened: 2,
        pyqsOpened: 0,
      },
      {
        activityDate: "2026-11-08",
        totalResourcesOpened: 1,
        notesOpened: 0,
        pyqsOpened: 1,
      },
    ],
  });
  try {
    const result = await getStudentActivitySummary({
      studentId: new mongoose.Types.ObjectId(),
      joinedAt: new Date("2026-11-05T05:00:00.000Z"),
      now: new Date("2026-11-09T08:00:00.000Z"),
    });
    const byDate = new Map(result.days.map((day) => [day.date, day]));
    assert.equal(result.timeZone, "Asia/Kolkata");
    assert.equal(result.endDate, "2026-11-09");
    assert.equal(byDate.get("2026-11-05").status, "absent");
    assert.equal(byDate.get("2026-11-06").status, "present");
    assert.equal(byDate.get("2026-11-07").status, "absent");
    assert.equal(byDate.get("2026-11-08").status, "present");
    assert.equal(byDate.get("2026-11-09").status, "today");
    assert.ok(result.days.every((day) => day.date >= result.startDate && day.date <= result.endDate));
    assert.equal(result.summary.totalActiveDays, 2);
    assert.equal(result.summary.totalResourcesOpened, 3);
    assert.equal(result.summary.totalNotesOpened, 2);
    assert.equal(result.summary.totalPyqsOpened, 1);
    assert.equal(result.summary.currentStreak, 1);
    assert.equal(result.summary.longestStreak, 1);
    assert.equal(result.months.length, 12);
  } finally {
    DailyLearningActivity.find = originalFind;
  }
});
