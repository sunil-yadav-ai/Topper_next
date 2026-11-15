import assert from "node:assert/strict";
import test from "node:test";

process.env.GEMINI_API_KEY = "test-gemini-api-key";
process.env.GEMINI_TUTOR_MODEL = "test-tutor-model";
process.env.GEMINI_OCR_MODEL = "test-ocr-model";
const [{ env }, { generateStructuredContent }, helpers] = await Promise.all([
  import("../config/env.js"),
  import("./gemini-ai.service.js"),
  import("../test/gemini-test-helpers.js"),
]);

const schema = {
  type: "object",
  properties: { text: { type: "string" } },
  required: ["text"],
};

test("maps an invalid Gemini API key to a safe configuration error", async (t) => {
  helpers.mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (url) => {
    if (!helpers.isGeminiRequest(url)) throw new Error("Unexpected request URL.");
    requests += 1;
    return Response.json(
      { error: { message: "API key not valid. Please pass a valid API key." } },
      { status: 403 },
    );
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    generateStructuredContent({
      feature: "tutor",
      userId: "507f1f77bcf86cd799439011",
      instructions: "Return structured data.",
      contents: [{ role: "user", parts: [{ text: "Test" }] }],
      schema,
      maxOutputTokens: 100,
    }),
    (error) => {
      assert.equal(error.statusCode, 503);
      assert.equal(error.code, "GEMINI_AUTH_ERROR");
      assert.match(error.message, /not authorized/i);
      assert.doesNotMatch(error.message, /API key not valid/i);
      return true;
    },
  );
  assert.equal(requests, 1);
});

test("rejects malformed Gemini JSON instead of returning a fallback result", async (t) => {
  helpers.mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    candidates: [{
      content: { parts: [{ text: "not-json" }] },
    }],
  });
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await assert.rejects(
    generateStructuredContent({
      feature: "tutor",
      userId: "507f1f77bcf86cd799439011",
      instructions: "Return structured data.",
      contents: [{ role: "user", parts: [{ text: "Test" }] }],
      schema,
      maxOutputTokens: 100,
    }),
    { statusCode: 502, code: "GEMINI_INVALID_RESPONSE" },
  );
});

test("enforces daily limits across features without limiting other students", async (t) => {
  helpers.mockGeminiUsage(t);
  const originalFetch = globalThis.fetch;
  const originalDailyLimit = env.geminiUserDailyRequestLimit;
  const originalMinuteLimit = env.geminiUserMinuteRequestLimit;
  const originalOcrModel = env.geminiOcrModel;
  env.geminiUserDailyRequestLimit = 1;
  env.geminiUserMinuteRequestLimit = 10;
  env.geminiOcrModel = "test-ocr-model";
  let requests = 0;
  globalThis.fetch = async (url) => {
    if (!helpers.isGeminiRequest(url)) throw new Error("Unexpected request URL.");
    requests += 1;
    return helpers.geminiJsonResponse({ text: "ok" });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    env.geminiUserDailyRequestLimit = originalDailyLimit;
    env.geminiUserMinuteRequestLimit = originalMinuteLimit;
    env.geminiOcrModel = originalOcrModel;
  });

  const request = (feature, userId) => generateStructuredContent({
    feature,
    userId,
    contents: [{ role: "user", parts: [{ text: "Test" }] }],
    schema,
    maxOutputTokens: 100,
  });
  const firstUserId = "507f1f77bcf86cd799439011";
  const secondUserId = "507f1f77bcf86cd799439012";

  await request("tutor", firstUserId);
  await assert.rejects(request("ocr", firstUserId), {
    statusCode: 429,
    code: "USER_AI_RATE_LIMIT",
  });
  await request("tutor", secondUserId);
  assert.equal(requests, 2);
});
