import assert from "node:assert/strict";
import mongoose from "mongoose";
import test from "node:test";
import NoteCommunityReport from "./NoteCommunityReport.js";

function validReport(overrides = {}) {
  const userId = new mongoose.Types.ObjectId();
  return {
    note: new mongoose.Types.ObjectId(),
    reportedBy: userId,
    pageNumber: 2,
    category: "wrong_formula",
    explanation: "The denominator in the formula is incorrect.",
    suggestedCorrection: "Use the square of the denominator.",
    history: [
      {
        actor: userId,
        actorRole: "student",
        action: "reported",
        message: "Reported for review.",
        status: "open",
      },
    ],
    ...overrides,
  };
}

test("validates community report fields and correction history", () => {
  const report = new NoteCommunityReport(validReport());
  assert.equal(report.validateSync(), undefined);
  assert.equal(report.status, "open");
  assert.equal(report.history[0].action, "reported");
});

test("rejects invalid page numbers and issue categories", () => {
  assert.ok(
    new NoteCommunityReport(validReport({ pageNumber: 0 }))
      .validateSync()
      .errors.pageNumber,
  );
  assert.ok(
    new NoteCommunityReport(validReport({ category: "not_a_category" }))
      .validateSync()
      .errors.category,
  );
});
