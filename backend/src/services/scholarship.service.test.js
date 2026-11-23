import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateEligibility,
  getEligibilityQuestions,
  isApplicationOpen,
  mergeEligibilityAnswers,
  normalizeSlug,
  serializeScholarship,
} from "./scholarship.service.js";

test("scholarship slug is normalized", () => {
  assert.equal(normalizeSlug("  State Merit & Girls  Scholarship "), "state-merit-girls-scholarship");
});

test("eligibility engine reports exact income failure", () => {
  const result = evaluateEligibility(
    { annualFamilyIncome: 500000, state: "Delhi" },
    {
      incomeLimit: 250000,
      officialSourceUrl: "https://example.gov.in/scholarship",
      eligibilityRules: [],
    },
  );
  assert.equal(result.result, "NOT_ELIGIBLE");
  assert.match(result.reasons[0], /annual family income exceeds/i);
  assert.equal(result.estimated, true);
});

test("eligibility engine distinguishes missing profile information", () => {
  const result = evaluateEligibility(
    { annualFamilyIncome: 100000 },
    {
      officialSourceUrl: "https://example.gov.in/scholarship",
      eligibilityRules: [
        { field: "state", operator: "eq", value: "Delhi", reason: "State must be Delhi." },
      ],
    },
  );
  assert.equal(result.result, "MORE_INFORMATION_REQUIRED");
  assert.ok(result.missingFields.includes("state"));
});

test("eligibility engine handles AND and OR rule groups", () => {
  const result = evaluateEligibility(
    { category: "sc", gender: "female", annualFamilyIncome: 100000 },
    {
      officialSourceUrl: "https://example.gov.in/scholarship",
      eligibilityRules: [
        { field: "gender", operator: "eq", value: "female", reason: "Female applicants only." },
      ],
      eligibilityGroups: [
        { operator: "OR", reason: "Category must be SC or ST.", rules: [
          { field: "category", operator: "eq", value: "sc" },
          { field: "category", operator: "eq", value: "st" },
        ] },
      ],
    },
  );
  assert.equal(result.result, "ELIGIBLE");
});

test("eligibility questions include only missing scholarship-specific fields", () => {
  const questions = getEligibilityQuestions(
    {
      eligibilityRules: [
        { field: "state", operator: "eq", value: "Punjab" },
        { field: "annualFamilyIncome", operator: "lte", value: 250000 },
      ],
    },
    { state: "Punjab" },
  );
  assert.deepEqual(questions.map((question) => question.field), ["annualFamilyIncome"]);
});

test("eligibility check asks required UGC details and evaluates the student's answers", () => {
  const scholarship = {
    eligibilityRules: [
      { field: "netJrfQualified", operator: "eq", value: true, reason: "NET-JRF or UGC-CSIR qualification is required." },
      { field: "researchRegistrationWithinStipulatedPeriod", operator: "eq", value: true, reason: "Registration must be within two years." },
    ],
  };
  const initial = evaluateEligibility({}, scholarship);
  assert.equal(initial.result, "MORE_INFORMATION_REQUIRED");
  assert.deepEqual(initial.questions.map((question) => question.field), [
    "netJrfQualified",
    "researchRegistrationWithinStipulatedPeriod",
  ]);

  const answers = mergeEligibilityAnswers(null, {
    netJrfQualified: "yes",
    researchRegistrationWithinStipulatedPeriod: "yes",
  });
  assert.equal(evaluateEligibility(answers, scholarship).result, "ELIGIBLE");

  const failedAnswers = mergeEligibilityAnswers(null, {
    netJrfQualified: "no",
    researchRegistrationWithinStipulatedPeriod: "yes",
  });
  assert.equal(evaluateEligibility(failedAnswers, scholarship).result, "NOT_ELIGIBLE");
});

test("eligibility is not guessed when verified rules are unavailable", () => {
  const result = evaluateEligibility(
    {},
    { officialSourceUrl: "https://example.gov.in/scheme", eligibilityRules: [] },
  );
  assert.equal(result.result, "MORE_INFORMATION_REQUIRED");
  assert.equal(result.criteriaAvailable, false);
  assert.equal(result.questions.length, 0);
});

test("a satisfied OR branch does not request the other branch's missing information", () => {
  const result = evaluateEligibility(
    { category: "sc" },
    {
      officialSourceUrl: "https://example.gov.in/scheme",
      eligibilityGroups: [{
        operator: "OR",
        rules: [
          { field: "category", operator: "eq", value: "sc" },
          { field: "gender", operator: "eq", value: "female" },
        ],
      }],
    },
  );
  assert.equal(result.result, "ELIGIBLE");
  assert.deepEqual(result.missingFields, []);
  assert.deepEqual(result.questions, []);
});

test("a scholarship is not marked open unless its application status is verified", () => {
  const scholarship = {
    publicationStatus: "published",
    applicationStatus: "open",
    applicationDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
  };

  assert.equal(serializeScholarship(scholarship).open, false);
  assert.equal(serializeScholarship({ ...scholarship, applicationStatusVerified: true }).open, true);
});

test("application eligibility requires a verified open window and an unexpired deadline", () => {
  const now = new Date("2026-11-23T12:00:00Z");
  const base = {
    publicationStatus: "published",
    applicationStatus: "open",
    applicationStatusVerified: true,
    applicationDeadline: new Date("2026-11-24T00:00:00Z"),
  };

  assert.equal(isApplicationOpen(base, now), true);
  assert.equal(isApplicationOpen({ ...base, applicationStatusVerified: false }, now), false);
  assert.equal(isApplicationOpen({ ...base, applicationStatus: "unknown" }, now), false);
  assert.equal(isApplicationOpen({ ...base, applicationDeadline: new Date("2026-11-22T00:00:00Z") }, now), false);
});
