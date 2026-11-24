import test from "node:test";
import assert from "node:assert/strict";
import { eligibilityNeedsProfile } from "./scholarship-profile.js";

test("redirects only when backend evaluation reports required missing information", () => {
  assert.equal(eligibilityNeedsProfile({
    result: "MORE_INFORMATION_REQUIRED",
    criteriaAvailable: true,
    missingFields: ["annualFamilyIncome"],
  }), true);
  assert.equal(eligibilityNeedsProfile({
    result: "VERIFICATION_REQUIRED",
    criteriaAvailable: false,
    missingFields: [],
  }), false);
  assert.equal(eligibilityNeedsProfile({
    result: "ELIGIBLE",
    criteriaAvailable: true,
    missingFields: [],
  }), false);
});
