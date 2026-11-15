import GeminiUsage from "../models/GeminiUsage.js";

export function mockGeminiUsage(t) {
  const originalFindOneAndUpdate = GeminiUsage.findOneAndUpdate;
  const originalUpdateOne = GeminiUsage.updateOne;
  const counts = new Map();
  const keyFor = (filter) =>
    [
      String(filter.user),
      filter.windowType,
      filter.feature,
      new Date(filter.windowStart).toISOString(),
    ].join(":");

  GeminiUsage.findOneAndUpdate = async (filter, update) => {
    const key = keyFor(filter);
    const requestCount = (counts.get(key) ?? 0) + update.$inc.requestCount;
    counts.set(key, requestCount);
    return { _id: key, requestCount };
  };
  GeminiUsage.updateOne = async (filter, update) => {
    const entry = [...counts.entries()].find(([key]) => key === filter._id);
    if (entry && entry[1] > (filter.requestCount?.$gt ?? 0)) {
      counts.set(entry[0], entry[1] + update.$inc.requestCount);
    }
    return { acknowledged: true };
  };
  t.after(() => {
    GeminiUsage.findOneAndUpdate = originalFindOneAndUpdate;
    GeminiUsage.updateOne = originalUpdateOne;
  });
}

export function isGeminiRequest(url) {
  return String(url).includes("generativelanguage.googleapis.com");
}

export function geminiJsonResponse(value, groundingChunks) {
  return Response.json({
    candidates: [{
      content: {
        role: "model",
        parts: [{ text: JSON.stringify(value) }],
      },
      ...(groundingChunks
        ? { groundingMetadata: { groundingChunks } }
        : {}),
    }],
  });
}
