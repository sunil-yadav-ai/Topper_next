import mongoose from "mongoose";

const geminiUsageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    windowType: {
      type: String,
      enum: ["minute", "day"],
      required: true,
    },
    feature: { type: String, required: true, maxlength: 40 },
    windowStart: { type: Date, required: true },
    requestCount: { type: Number, min: 0, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

geminiUsageSchema.index(
  { user: 1, windowType: 1, feature: 1, windowStart: 1 },
  { unique: true },
);
geminiUsageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const GeminiUsage = mongoose.models.GeminiUsage || mongoose.model("GeminiUsage", geminiUsageSchema);

export default GeminiUsage;
