import assert from "node:assert/strict";
import test from "node:test";

process.env.GEMINI_API_KEY = "test-api-key";
process.env.GEMINI_OCR_MODEL = "test-ocr-model";
import {
  geminiJsonResponse,
  isGeminiRequest,
  mockGeminiUsage,
} from "../test/gemini-test-helpers.js";
const { assertNoteSubjectRelevance } = await import("./note-relevance.service.js");
const userId = "507f1f77bcf86cd799439011";

function makeFile(mimetype = "application/pdf") {
  return {
    mimetype,
    buffer: Buffer.from("%PDF-1.7 test"),
  };
}

test("accepts notes at or above the relevance threshold and sends the file with its topic context", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    assert.equal(isGeminiRequest(url), true);
    request = JSON.parse(options.body);
    return geminiJsonResponse({
      relevancePercentage: 90,
      analysisReliable: true,
    });
  };

  try {
    const score = await assertNoteSubjectRelevance({
      userId,
      file: makeFile(),
      fields: {
        subject: "Computer Graphics",
        topic: "Rasterization",
        title: "Rasterization notes",
        description: "Line and polygon drawing algorithms",
      },
    });

    assert.equal(score, 90);
    const parts = request.contents[0].parts;
    assert.deepEqual(JSON.parse(parts[0].text), {
      subject: "Computer Graphics",
      topic: "Rasterization",
      title: "Rasterization notes",
      description: "Line and polygon drawing algorithms",
    });
    assert.equal(parts[1].inlineData.mimeType, "application/pdf");
    assert.equal(
      Buffer.from(parts[1].inlineData.data, "base64").toString(),
      "%PDF-1.7 test",
    );
    assert.match(JSON.stringify(request.systemInstruction), /untrusted data/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rejects notes below 90 percent and unreliable assessments", async (t) => {
  mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  let assessment = { relevancePercentage: 89, analysisReliable: true };
  globalThis.fetch = async () => geminiJsonResponse(assessment);

  try {
    await assert.rejects(
      assertNoteSubjectRelevance({
        userId,
        file: makeFile("image/png"),
        fields: { subject: "Physics", title: "Biology notes" },
      }),
      (error) => {
        assert.equal(error.statusCode, 422);
        assert.match(error.message, /89% related/i);
        return true;
      },
    );

    assessment = { relevancePercentage: 99, analysisReliable: false };
    await assert.rejects(
      assertNoteSubjectRelevance({
        userId,
        file: makeFile("image/jpeg"),
        fields: { subject: "Physics", title: "Physics notes" },
      }),
      (error) => {
        assert.equal(error.statusCode, 422);
        assert.match(error.message, /could not be reliably checked/i);
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not allow unsupported files or AI failures to pass the check", async (t) => {
  mockGeminiUsage(t);
  await assert.rejects(
    assertNoteSubjectRelevance({
      userId,
      file: { mimetype: "text/plain", buffer: Buffer.from("notes") },
      fields: { subject: "Physics" },
    }),
    { statusCode: 400 },
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    Response.json({ error: { message: "service unavailable" } }, { status: 503 });
  try {
    await assert.rejects(
      assertNoteSubjectRelevance({
        userId,
        file: makeFile(),
        fields: { subject: "Physics" },
      }),
      /AI service is temporarily unavailable/i,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
