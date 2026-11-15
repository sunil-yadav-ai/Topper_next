import mongoose from "mongoose";

const contributionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "handwritten_note",
        "pyq",
        "verified_correction",
        "high_quality_resource",
      ],
      required: true,
      index: true,
    },
    sourceType: {
      type: String,
      enum: ["note", "pyq", "community_report"],
      required: true,
    },
    sourceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, trim: true, maxlength: 240 },
    pointsAwarded: { type: Number, min: 0, default: 0 },
    status: {
      type: String,
      enum: ["awarded", "unfunded"],
      required: true,
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    rewardTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RewardTransaction",
      default: null,
    },
  },
  { timestamps: true },
);

contributionSchema.index(
  { type: 1, sourceType: 1, sourceId: 1 },
  { unique: true },
);
contributionSchema.index({ user: 1, createdAt: -1 });
contributionSchema.index({ status: 1, createdAt: -1 });

const Contribution =
  mongoose.models.Contribution || mongoose.model("Contribution", contributionSchema);

export default Contribution;
