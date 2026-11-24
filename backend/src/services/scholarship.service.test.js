import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateEligibility,
  getOfficialIshanUdayEligibilityRules,
  getOfficialUgcPgEligibilityRules,
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

test("official UGC postgraduate scholarship rules produce an eligibility result", () => {
  const scholarship = {
    title: "National Scholarship for Post Graduate Studies",
    sourceName: "University Grants Commission",
  };
  const rules = getOfficialUgcPgEligibilityRules(scholarship);
  assert.equal(rules.length, 6);

  const missing = evaluateEligibility({}, { eligibilityRules: rules });
  assert.equal(missing.result, "MORE_INFORMATION_REQUIRED");
  assert.ok(missing.questions.some((question) => question.field === "nationality"));
  assert.ok(missing.questions.some((question) => question.field === "firstYearPostgraduate"));

  const eligible = evaluateEligibility({
    nationality: "Indian",
    dateOfBirth: "2005-04-15",
    firstYearPostgraduate: "yes",
    regularFullTime: "yes",
    recognizedPgDegree: "yes",
    postgraduateComponent: "not_applicable",
  }, { eligibilityRules: rules });
  assert.equal(eligible.result, "VERIFICATION_REQUIRED");
  assert.match(eligible.verificationRequired.join(" "), /official verification/i);

  const overAgeLimit = evaluateEligibility({
    nationality: "Indian",
    dateOfBirth: "1990-04-15",
    firstYearPostgraduate: "yes",
    regularFullTime: "yes",
    recognizedPgDegree: "yes",
    postgraduateComponent: "not_applicable",
  }, { eligibilityRules: rules });
  assert.equal(overAgeLimit.result, "NOT_ELIGIBLE");
});

test("Ishan Uday fallback evaluates every supplied eligibility condition and flags unverifiable recognition", () => {
  const scholarship = {
    title: "Ishan Uday Special Scholarship Scheme",
    sourceName: "University Grants Commission",
  };
  const rules = getOfficialIshanUdayEligibilityRules(scholarship);
  assert.equal(rules.length, 6);
  const missing = evaluateEligibility({}, { eligibilityRules: rules });
  assert.deepEqual(new Set(missing.missingFields), new Set([
    "class12Passed",
    "twelfthSchoolState",
    "undergraduateFirstYear",
    "admissionType",
    "recognizedInstitution",
    "annualFamilyIncome",
  ]));
  assert.equal(missing.questions.length, 6);

  const completeProfile = {
    class12Passed: true,
    twelfthSchoolState: "Assam",
    undergraduateFirstYear: "yes",
    admissionType: "regular",
    recognizedInstitution: "yes",
    annualFamilyIncome: 449999,
  };
  const eligiblePendingVerification = evaluateEligibility(
    completeProfile,
    { eligibilityRules: rules },
  );
  assert.equal(eligiblePendingVerification.result, "VERIFICATION_REQUIRED");
  assert.equal(eligiblePendingVerification.criteria.length, 6);
  assert.ok(eligiblePendingVerification.criteria.every((criterion) =>
    ["MET", "VERIFICATION_REQUIRED"].includes(criterion.status)));
  assert.match(eligiblePendingVerification.verificationRequired.join(" "), /recognized by UGC/i);

  const incomeAtLimit = evaluateEligibility(
    { ...completeProfile, annualFamilyIncome: 450000 },
    { eligibilityRules: rules },
  );
  assert.equal(incomeAtLimit.result, "NOT_ELIGIBLE");
  assert.ok(incomeAtLimit.reasons.some((reason) => /below ₹4\.50 lakh/i.test(reason)));

  const outsideRegion = evaluateEligibility(
    { ...completeProfile, twelfthSchoolState: "Delhi" },
    { eligibilityRules: rules },
  );
  assert.equal(outsideRegion.result, "NOT_ELIGIBLE");
  assert.ok(outsideRegion.reasons.some((reason) => /North Eastern Region/i.test(reason)));
});

test("eligibility is not guessed when verified rules are unavailable", () => {
  const result = evaluateEligibility(
    {},
    { officialSourceUrl: "https://example.gov.in/scheme", eligibilityRules: [] },
  );
  assert.equal(result.result, "VERIFICATION_REQUIRED");
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

  const remainingRequiredField = evaluateEligibility(
    { category: "sc" },
    {
      officialSourceUrl: "https://example.gov.in/scheme",
      eligibilityRules: [{ field: "state", operator: "eq", value: "Assam" }],
      eligibilityGroups: [{
        operator: "OR",
        rules: [
          { field: "category", operator: "eq", value: "sc" },
          { field: "gender", operator: "eq", value: "female" },
        ],
      }],
    },
  );
  assert.deepEqual(remainingRequiredField.missingFields, ["state"]);
  assert.deepEqual(remainingRequiredField.questions.map((question) => question.field), ["state"]);
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
