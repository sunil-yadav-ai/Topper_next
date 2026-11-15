import assert from "node:assert/strict";
import test from "node:test";

process.env.GEMINI_API_KEY = "test-api-key";
process.env.GEMINI_VERIFICATION_MODEL = "test-verification-model";
process.env.GEMINI_VERIFICATION_USE_GOOGLE_SEARCH = "true";
process.env.ACADEMIC_REFERENCE_DOMAINS = "openstax.org,nist.gov";
import {
  geminiJsonResponse,
  mockGeminiUsage,
} from "../test/gemini-test-helpers.js";
const { verifyAcademicNotes } = await import("./note-verification.service.js");
const testUserId = "507f1f77bcf86cd799439011";

function issue(overrides = {}) {
  return {
    pageNumber: 1,
    originalStatement: "The derivative of x^2 is 2x.",
    issueDescription: "This statement is correct.",
    suggestedCorrection: "",
    errorCategory: "incorrect_explanation",
    classification: "CONFIRMED_ERROR",
    confidence: 0.97,
    verificationEvidence: "The reference gives the power rule.",
    referenceUrls: ["https://openstax.org/books/calculus-volume-1"],
    ...overrides,
  };
}

test("requires OCR provenance and actual Gemini grounding citations to confirm errors", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return geminiJsonResponse(
      {
        issues: [
          issue(),
          issue({
            originalStatement: "A fabricated statement.",
            errorCategory: "factual_inaccuracy",
            referenceUrls: ["https://openstax.org/books/calculus-volume-1"],
          }),
          issue({
            originalStatement: "Another statement from the page.",
            referenceUrls: [],
          }),
          issue({
            originalStatement: "The derivative of x^2 is 2x.",
            confidence: 0.62,
          }),
        ],
        pages: [{
          pageNumber: 1,
          verifiableStatementCount: 20,
          analysisReliable: true,
          analysisLimitations: [],
        }],
      },
      [{
        web: {
          title: "OpenStax Calculus Volume 1",
          uri: "https://openstax.org/books/calculus-volume-1",
        },
      }],
    );
  };

  try {
    const result = await verifyAcademicNotes({
      note: {
        title: "Calculus",
        description: "Derivative rules",
        department: "Mathematics",
        semester: 1,
        subject: "Calculus",
        unit: "Derivatives",
        topic: "Power rule",
        uploadedBy: testUserId,
      },
      ocrResult: {
        pages: [
          {
            pageNumber: 1,
            extractedText: "The derivative of x^2 is 2x.",
            recognizedFormulas: [],
            readabilityStatus: "readable",
            ocrConfidence: 0.95,
            unclearRegions: [],
          },
        ],
      },
    });

    assert.match(JSON.stringify(request), /definitions, formulas, calculations/i);
    assert.match(JSON.stringify(request), /contradictions/i);
    assert.match(JSON.stringify(request), /potential_safety_concern/i);
    assert.match(JSON.stringify(request), /potential_copyright_concern/i);
    assert.deepEqual(request.tools[0].googleSearch, {});
    assert.equal(result.report.overallClassification, "CONFIRMED_ERROR");
    assert.equal(result.report.confirmedErrorCount, 2);
    assert.equal(result.report.uncertainCount, 2);
    assert.equal(result.report.issues[0].classification, "CONFIRMED_ERROR");
    assert.equal(
      result.report.issues[0].references[0].title,
      "OpenStax Calculus Volume 1",
    );
    assert.equal(result.report.issues[1].classification, "UNCERTAIN");
    assert.match(result.report.issues[1].verificationEvidence, /could not be matched/i);
    assert.equal(result.report.issues[2].classification, "UNCERTAIN");
    assert.deepEqual(result.report.issues[2].references, []);
    assert.equal(result.report.issues[3].classification, "CONFIRMED_ERROR");
    assert.equal(result.report.issues[3].confidence, 0.62);
    assert.equal(result.report.totalVerifiableStatements, 20);
    assert.equal(result.report.analysisReliable, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("accepts uncertain safety and copyright findings for human review", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    geminiJsonResponse({
      issues: [issue({
        errorCategory: "potential_copyright_concern",
        classification: "UNCERTAIN",
        referenceUrls: [],
      })],
      pages: [{
        pageNumber: 1,
        verifiableStatementCount: 20,
        analysisReliable: true,
        analysisLimitations: [],
      }],
    });

  try {
    const result = await verifyAcademicNotes({
      note: {
        title: "Calculus",
        description: "Derivative rules",
        department: "Mathematics",
        semester: 1,
        subject: "Calculus",
        unit: "Derivatives",
        topic: "Power rule",
        uploadedBy: testUserId,
      },
      ocrResult: {
        pages: [
          {
            pageNumber: 1,
            extractedText: "The derivative of x^2 is 2x.",
            recognizedFormulas: [],
            readabilityStatus: "readable",
            ocrConfidence: 0.95,
            unclearRegions: [],
          },
        ],
      },
    });

    assert.equal(result.report.issues[0].errorCategory, "potential_copyright_concern");
    assert.equal(result.report.issues[0].classification, "UNCERTAIN");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("returns NO_ISSUE_DETECTED when no substantive issue is found", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    geminiJsonResponse({
      issues: [],
      pages: [{
        pageNumber: 1,
        verifiableStatementCount: 5,
        analysisReliable: true,
        analysisLimitations: [],
      }],
    });

  try {
    const result = await verifyAcademicNotes({
      note: {
        title: "Biology",
        description: "Cell biology",
        department: "Biology",
        semester: 1,
        subject: "Biology",
        unit: "Cells",
        topic: "Cell membrane",
        uploadedBy: testUserId,
      },
      ocrResult: {
        pages: [
          {
            pageNumber: 1,
            extractedText: "The cell membrane is selectively permeable.",
            recognizedFormulas: [],
            readabilityStatus: "readable",
            ocrConfidence: 0.98,
            unclearRegions: [],
          },
        ],
      },
    });

    assert.equal(result.report.overallClassification, "NO_ISSUE_DETECTED");
    assert.deepEqual(result.report.issues, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not count statements on OCR-unreadable pages", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    geminiJsonResponse({
      issues: [],
      pages: [{
        pageNumber: 1,
        verifiableStatementCount: 12,
        analysisReliable: true,
        analysisLimitations: [],
      }],
    });

  try {
    const result = await verifyAcademicNotes({
      note: {
        title: "Physics",
        description: "Motion",
        department: "Physics",
        semester: 1,
        subject: "Physics",
        unit: "Motion",
        topic: "Velocity",
        uploadedBy: testUserId,
      },
      ocrResult: {
        pages: [
          {
            pageNumber: 1,
            extractedText: "[unclear]",
            recognizedFormulas: [],
            readabilityStatus: "unreadable",
            ocrConfidence: 0.1,
            unclearRegions: ["Entire page"],
          },
        ],
      },
    });

    assert.equal(result.report.pages[0].verifiableStatementCount, 0);
    assert.equal(result.report.pages[0].analysisReliable, false);
    assert.equal(result.report.totalVerifiableStatements, 0);
    assert.equal(result.report.analysisReliable, false);
    assert.equal(result.report.unreadablePageCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("surfaces Gemini verification failures for worker retry and human review handling", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ error: { message: "service unavailable" } }, { status: 503 });

  try {
    await assert.rejects(
      verifyAcademicNotes({
        note: {
          title: "Calculus",
          description: "Derivative rules",
          department: "Mathematics",
          semester: 1,
          subject: "Calculus",
          unit: "Derivatives",
          topic: "Power rule",
          uploadedBy: testUserId,
        },
        ocrResult: {
          pages: [
            {
              pageNumber: 1,
              extractedText: "The derivative of x^2 is 2x.",
              recognizedFormulas: [],
              readabilityStatus: "readable",
              ocrConfidence: 0.95,
              unclearRegions: [],
            },
          ],
        },
      }),
      /AI service is temporarily unavailable/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not confirm factual findings without actual grounded citations", async (t) => {
  mockGeminiUsage(t);
  const { env } = await import("../config/env.js");
  const originalSearchSetting = env.geminiVerificationUseGoogleSearch;
  const originalFetch = globalThis.fetch;
  env.geminiVerificationUseGoogleSearch = false;
  globalThis.fetch = async () => geminiJsonResponse({
    issues: [issue()],
    pages: [{
      pageNumber: 1,
      verifiableStatementCount: 5,
      analysisReliable: true,
      analysisLimitations: [],
    }],
  });

  try {
    const result = await verifyAcademicNotes({
      note: {
        title: "Calculus",
        description: "Derivative rules",
        department: "Mathematics",
        semester: 1,
        subject: "Calculus",
        unit: "Derivatives",
        topic: "Power rule",
        uploadedBy: testUserId,
      },
      ocrResult: {
        pages: [{
          pageNumber: 1,
          extractedText: "The derivative of x^2 is 2x.",
          recognizedFormulas: [],
          readabilityStatus: "readable",
          ocrConfidence: 0.95,
          unclearRegions: [],
        }],
      },
    });
    assert.equal(result.report.issues[0].classification, "UNCERTAIN");
    assert.deepEqual(result.report.issues[0].references, []);
  } finally {
    env.geminiVerificationUseGoogleSearch = originalSearchSetting;
    globalThis.fetch = originalFetch;
  }
});
