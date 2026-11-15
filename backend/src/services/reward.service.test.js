import assert from "node:assert/strict";
import test from "node:test";
import Contribution from "../models/Contribution.js";
import RewardAccount from "../models/RewardAccount.js";
import RewardBudget from "../models/RewardBudget.js";
import RewardTransaction from "../models/RewardTransaction.js";
import {
  getContributionPolicy,
  isRewardableCorrectionCategory,
} from "./reward.service.js";

test("reward policies award only verified contribution categories", () => {
  assert.equal(getContributionPolicy("handwritten_note").points, 10);
  assert.equal(getContributionPolicy("pyq").points, 8);
  assert.equal(getContributionPolicy("verified_correction").points, 5);
  assert.equal(getContributionPolicy("high_quality_resource").points, 15);
  assert.equal(getContributionPolicy("ad_click"), null);
  assert.equal(isRewardableCorrectionCategory("wrong_formula"), true);
  assert.equal(isRewardableCorrectionCategory("poor_readability"), false);
  assert.equal(isRewardableCorrectionCategory("duplicate_content"), false);
});

test("reward records have idempotency, student balance, and finite budget fields", () => {
  assert.ok(
    Contribution.schema.indexes().some(
      ([fields, options]) =>
        fields.type === 1 &&
        fields.sourceType === 1 &&
        fields.sourceId === 1 &&
        options.unique,
    ),
  );
  assert.ok(RewardTransaction.schema.path("idempotencyKey").options.unique);
  assert.ok(RewardTransaction.schema.path("budgetDelta"));
  assert.ok(RewardAccount.schema.path("points"));
  assert.ok(RewardBudget.schema.path("availablePoints"));
  assert.ok(RewardBudget.schema.path("distributedPoints"));
  assert.ok(RewardBudget.schema.path("reclaimedPoints"));
});
