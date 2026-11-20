import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import LearningActivity from "../models/LearningActivity.js";
import User from "../models/User.js";
import { getActivityDateKey } from "../services/learning-activity.service.js";
import { getLearningActivity } from "./learning-activity.controller.js";

test("public profile visitors can view a student's note-open dates", async () => {
  const studentId = new mongoose.Types.ObjectId();
  const today = getActivityDateKey();
  const originalFindOne = User.findOne;
  const originalActivityAggregate = LearningActivity.aggregate;
  User.findOne = (filter) => {
    assert.deepEqual(filter, { username: "ada.student", role: "user" });
    return {
      select: async (fields) => {
        assert.equal(fields, "_id createdAt");
        return { _id: studentId, createdAt: new Date("2024-01-01T00:00:00.000Z") };
      },
    };
  };
  LearningActivity.aggregate = async (pipeline) => {
    assert.equal(pipeline[0].$match.userId, studentId);
    assert.equal(pipeline[0].$match.activityDate.$lte, today);
    return [{
      activityDate: today,
      totalResourcesOpened: 2,
      notesOpened: 2,
      pyqsOpened: 0,
    }];
  };
  const response = { json(payload) { this.payload = payload; } };

  try {
    await getLearningActivity(
      { params: { username: "Ada.Student" } },
      response,
    );
    const todayActivity = response.payload.activity.days.find((day) => day.date === today);
    assert.equal(response.payload.status, "success");
    assert.equal(todayActivity.status, "present");
    assert.equal(todayActivity.notesOpened, 2);
  } finally {
    User.findOne = originalFindOne;
    LearningActivity.aggregate = originalActivityAggregate;
  }
});
