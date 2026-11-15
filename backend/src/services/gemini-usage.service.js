import GeminiUsage from "../models/GeminiUsage.js";
import { env } from "../config/env.js";

function rateLimitError(retryAfterMs) {
  const error = new Error(
    "You have reached the AI request limit. Please wait for the limit to reset and try again.",
  );
  error.statusCode = 429;
  error.expose = true;
  error.code = "USER_AI_RATE_LIMIT";
  error.retryableRateLimit = false;
  error.retryAfterMs = retryAfterMs;
  return error;
}

async function incrementBucket({ userId, windowType, feature, windowStart, limit, expiresAt }) {
  const filter = { user: userId, windowType, feature, windowStart };
  let usage;
  try {
    usage = await GeminiUsage.findOneAndUpdate(
      filter,
      {
        $inc: { requestCount: 1 },
        $setOnInsert: { expiresAt },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  } catch (error) {
    if (error.code !== 11000) throw error;
    usage = await GeminiUsage.findOneAndUpdate(
      filter,
      { $inc: { requestCount: 1 } },
      { new: true },
    );
  }
  if (!usage) {
    throw new Error("Gemini usage tracking failed to update its request counter.");
  }
  if (usage.requestCount > limit) {
    await GeminiUsage.updateOne(
      { _id: usage._id, requestCount: { $gt: limit } },
      { $inc: { requestCount: -1 } },
    );
    throw rateLimitError(windowStart.getTime() + (windowType === "minute" ? 60_000 : 86_400_000) - Date.now());
  }

  return async () => {
    await GeminiUsage.updateOne(
      { _id: usage._id, requestCount: { $gt: 0 } },
      { $inc: { requestCount: -1 } },
    );
  };
}

export async function enforceGeminiUserLimits(userId, feature, now = new Date()) {
  if (!userId) {
    const error = new Error("An authenticated user is required for AI requests.");
    error.statusCode = 401;
    error.expose = true;
    throw error;
  }

  const minuteStart = new Date(now);
  minuteStart.setUTCSeconds(0, 0);
  const dayStart = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const releaseMinute = await incrementBucket({
    userId,
    windowType: "minute",
    feature,
    windowStart: minuteStart,
    limit: env.geminiUserMinuteRequestLimit,
    expiresAt: new Date(minuteStart.getTime() + 2 * 60_000),
  });
  try {
    await incrementBucket({
      userId,
      windowType: "day",
      feature: "all",
      windowStart: dayStart,
      limit: env.geminiUserDailyRequestLimit,
      expiresAt: new Date(dayStart.getTime() + 2 * 86_400_000),
    });
  } catch (error) {
    await releaseMinute();
    throw error;
  }
}
