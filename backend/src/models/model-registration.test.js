import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";

const modelNames = [
  "Activity",
  "Contribution",
  "Bookmark",
  "Follow",
  "DailyLearningActivity",
  "GeminiUsage",
  "LearningActivity",
  "LearningSession",
  "Note",
  "NoteOcrJob",
  "NoteCommunityReport",
  "NoteOcrResult",
  "NoteVerificationHistory",
  "NoteVerificationJob",
  "NoteVerificationResult",
  "Notification",
  "PyqReport",
  "PracticeSession",
  "Pyq",
  "Resource",
  "ResourceHelpfulVote",
  "RewardAccount",
  "RewardBudget",
  "RewardTransaction",
  "StudentResourceAccess",
  "SyllabusAnalysis",
  "User",
  "Scholarship",
  "ScholarshipProfile",
  "ScholarshipApplication",
  "SavedScholarship",
  "ScholarshipSource",
  "ScholarshipNotification",
];

test("Mongoose model modules reuse registered models when evaluated more than once", async () => {
  for (const [index, name] of modelNames.entries()) {
    const first = await import(`./${name}.js?evaluation=first-${index}`);
    const registeredModel = mongoose.models[name];
    assert.ok(registeredModel, `${name} should be registered`);
    assert.strictEqual(first.default, registeredModel);

    const second = await import(`./${name}.js?evaluation=second-${index}`);
    assert.strictEqual(second.default, registeredModel, `${name} should be reused`);
  }
});
