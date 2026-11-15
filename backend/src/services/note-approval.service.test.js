import assert from "node:assert/strict";
import test from "node:test";
import {
  decideNoteApproval,
  getNotePublicationFields,
} from "./note-approval.service.js";

function report(totalVerifiableStatements, classifications, overrides = {}) {
  return {
    totalVerifiableStatements,
    issues: classifications.map((classification, index) => ({
      classification,
      confidence: index === 0 ? 0.01 : 0.99,
    })),
    pages: [{ pageNumber: 1 }],
    analysisReliable: true,
    unreadablePageCount: 0,
    ...overrides,
  };
}

test("approves at exactly five percent when verification findings are resolved", () => {
  const decision = decideNoteApproval(
    report(20, ["CONFIRMED_ERROR"]),
    5,
  );

  assert.equal(decision.decision, "APPROVED");
  assert.equal(decision.confirmedErrorCount, 1);
  assert.equal(decision.verifiableStatementCount, 20);
  assert.equal(decision.mistakePercentage, 5);
});

test("keeps normal academic uncertainty eligible but holds safety and copyright concerns", () => {
  const normalUncertainty = decideNoteApproval(
    report(20, [], {
      issues: [{ classification: "UNCERTAIN", errorCategory: "factual_inaccuracy" }],
    }),
    5,
  );
  assert.equal(normalUncertainty.decision, "APPROVED");

  for (const issue of [
    {
      classification: "CONFIRMED_ERROR",
      errorCategory: "potential_safety_concern",
    },
    {
      classification: "CONFIRMED_ERROR",
      errorCategory: "potential_copyright_concern",
    },
    {
      classification: "CONFIRMED_ERROR",
      errorCategory: "other_content_concern",
    },
  ]) {
    const decision = decideNoteApproval(
      report(20, [], { issues: [issue] }),
      5,
    );
    assert.equal(decision.decision, "NEEDS_HUMAN_REVIEW");
    assert.equal(decision.mistakePercentage, null);
  }
});

test("approves with warning at ten percent and rejects only above ten percent", () => {
  assert.equal(
    decideNoteApproval(
      report(20, ["CONFIRMED_ERROR", "CONFIRMED_ERROR"]),
      5,
    ).decision,
    "APPROVED_WITH_WARNING",
  );
  assert.equal(
    decideNoteApproval(
      report(100, Array.from({ length: 11 }, () => "CONFIRMED_ERROR")),
      5,
    ).decision,
    "REJECTED",
  );
  assert.equal(
    decideNoteApproval(
      report(100, Array.from({ length: 10 }, () => "CONFIRMED_ERROR")),
      5,
    ).mistakePercentage,
    10,
  );
});

test("requires human review for too few statements or unreliable analysis", () => {
  const tooFew = decideNoteApproval(
    report(4, ["CONFIRMED_ERROR"], { analysisLimitations: ["Short note"] }),
    5,
  );
  assert.equal(tooFew.decision, "NEEDS_HUMAN_REVIEW");
  assert.equal(tooFew.mistakePercentage, null);

  const unreadable = decideNoteApproval(
    report(0, [], {
      analysisReliable: false,
      unreadablePageCount: 1,
      pages: [{ pageNumber: 1 }],
    }),
    5,
  );
  assert.equal(unreadable.decision, "NEEDS_HUMAN_REVIEW");
  assert.equal(unreadable.confirmedErrorCount, 0);
  assert.equal(unreadable.mistakePercentage, null);
});

test("publishes notes without changing or gating their AI verification decisions", () => {
  for (const decision of [
    "APPROVED",
    "APPROVED_WITH_WARNING",
    "PENDING",
    "NEEDS_HUMAN_REVIEW",
    "REJECTED",
  ]) {
    assert.deepEqual(getNotePublicationFields(decision), {
      publicationStatus: "published",
      visibility: "public",
    });
  }
});
