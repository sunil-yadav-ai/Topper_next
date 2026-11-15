import { GoogleGenAI } from "@google/genai";
import { env } from "../config/env.js";
import { enforceGeminiUserLimits } from "./gemini-usage.service.js";

const modelByFeature = {
  ocr: () => env.geminiOcrModel,
  syllabus: () => env.geminiSyllabusModel,
  verification: () => env.geminiVerificationModel,
  tutor: () => env.geminiTutorModel,
};

let client;
let clientApiKey;

function serviceError(message, statusCode = 502, code = "GEMINI_SERVICE_ERROR") {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.expose = true;
  error.code = code;
  return error;
}

function getClient() {
  if (!env.geminiApiKey) {
    throw serviceError(
      "AI features are not configured. Contact an administrator.",
      503,
      "GEMINI_NOT_CONFIGURED",
    );
  }
  if (!client || clientApiKey !== env.geminiApiKey) {
    client = new GoogleGenAI({
      apiKey: env.geminiApiKey,
      httpOptions: { retryOptions: { attempts: 1 } },
    });
    clientApiKey = env.geminiApiKey;
  }
  return client;
}

function toGeminiJsonSchema(schema) {
  if (Array.isArray(schema)) {
    return schema.map(toGeminiJsonSchema);
  }
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema.type) && schema.type.includes("null")) {
    const { type, ...rest } = schema;
    return {
      ...Object.fromEntries(
        Object.entries(rest).map(([key, value]) => [key, toGeminiJsonSchema(value)]),
      ),
      anyOf: type.map((value) => ({ type: value })),
    };
  }
  const result = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      toGeminiJsonSchema(value),
    ]),
  );
  return result;
}

function quotaExhausted(message) {
  return /daily quota|quota.*per day|requests per day|daily limit|resource_exhausted.*per_day/i.test(
    message,
  );
}

function retryDelayFromMessage(message) {
  const match = message.match(/retry(?:\s+in)?\s*[:=]?\s*([\d.]+)\s*(ms|s|sec|seconds?)/i);
  if (!match) return undefined;
  const amount = Number(match[1]);
  return Math.max(0, Math.ceil(amount * (/^ms$/i.test(match[2]) ? 1 : 1000)));
}

function normalizeProviderError(error, timeoutMs) {
  const message = String(error?.message ?? "");
  const status = Number(error?.status ?? error?.statusCode);
  if (
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    /timed out|timeout/i.test(message)
  ) {
    return serviceError(
      "The AI request timed out. Please try again with a smaller document.",
      504,
      "GEMINI_TIMEOUT",
    );
  }
  if (status === 401 || status === 403) {
    return serviceError(
      "AI access is not authorized. Contact an administrator.",
      503,
      "GEMINI_AUTH_ERROR",
    );
  }
  if (status === 429 || /resource_exhausted|rate.?limit/i.test(message)) {
    const exhausted = quotaExhausted(message);
    const normalized = serviceError(
      exhausted
        ? "Gemini usage is temporarily exhausted for this project. Please try again after the quota resets."
        : "The AI service is receiving requests too quickly. Please wait and try again.",
      503,
      exhausted ? "GEMINI_QUOTA_EXHAUSTED" : "GEMINI_RATE_LIMIT",
    );
    normalized.retryableRateLimit = !exhausted;
    normalized.retryAfterMs = retryDelayFromMessage(message);
    normalized.providerErrorCode = exhausted
      ? "RESOURCE_EXHAUSTED"
      : "RATE_LIMIT";
    return normalized;
  }
  return serviceError(
    status >= 500
      ? "The AI service is temporarily unavailable. Please try again later."
      : "The AI request could not be processed. Check the file and try again.",
    status >= 500 ? 503 : 502,
    status >= 500 ? "GEMINI_UNAVAILABLE" : "GEMINI_INVALID_REQUEST",
  );
}

export async function generateStructuredContent({
  feature,
  userId,
  contents,
  instructions,
  schema,
  maxOutputTokens,
  timeoutMs = 60_000,
  useGoogleSearch = false,
}) {
  const getModel = modelByFeature[feature];
  if (!getModel) {
    throw new Error(`Unknown Gemini feature: ${feature}`);
  }
  const model = getModel();
  if (!model) {
    throw serviceError(
      `The Gemini model for ${feature} is not configured. Contact an administrator.`,
      503,
      "GEMINI_NOT_CONFIGURED",
    );
  }
  const gemini = getClient();
  await enforceGeminiUserLimits(userId, feature);

  let response;
  try {
    response = await gemini.models.generateContent({
      model,
      contents,
      config: {
        ...(instructions ? { systemInstruction: instructions } : {}),
        responseMimeType: "application/json",
        responseJsonSchema: toGeminiJsonSchema(schema),
        maxOutputTokens,
        abortSignal: AbortSignal.timeout(timeoutMs),
        httpOptions: { timeout: timeoutMs },
        ...(useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
      },
    });
  } catch (error) {
    throw normalizeProviderError(error, timeoutMs);
  }

  const outputText = response.text;
  if (typeof outputText !== "string" || !outputText.trim()) {
    throw serviceError(
      "The AI service returned an empty response. Please try again.",
      502,
      "GEMINI_INVALID_RESPONSE",
    );
  }
  let result;
  try {
    result = JSON.parse(outputText);
  } catch {
    throw serviceError(
      "The AI service returned an invalid response. Please try again.",
      502,
      "GEMINI_INVALID_RESPONSE",
    );
  }
  return {
    result,
    response,
    model: response.modelVersion || model,
  };
}

export function getGeminiGroundingSources(response) {
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return chunks.flatMap((chunk) => {
    const uri = chunk.web?.uri;
    const title = chunk.web?.title;
    if (typeof uri !== "string" || typeof title !== "string") return [];
    try {
      const url = new URL(uri);
      return url.protocol === "https:" ? [{ url: url.href, title }] : [];
    } catch {
      return [];
    }
  });
}
