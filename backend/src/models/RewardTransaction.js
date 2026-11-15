import mongoose from "mongoose";

const rewardTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["contribution", "admin_award", "admin_deduction"],
      required: true,
      index: true,
    },
    points: { type: Number, required: true, min: 1 },
    balanceAfter: { type: Number, required: true, min: 0 },
    budgetDelta: { type: Number, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 500 },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    contribution: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contribution",
      default: null,
    },
    sourceType: {
      type: String,
      enum: ["note", "pyq", "community_report", "admin"],
      required: true,
    },
    sourceId: { type: mongoose.Schema.Types.ObjectId, default: null },
    idempotencyKey: { type: String, required: true, unique: true, maxlength: 200 },
  },
  { timestamps: true },
);

rewardTransactionSchema.index({ user: 1, createdAt: -1 });
rewardTransactionSchema.index({ createdAt: -1 });

const RewardTransaction =
  mongoose.models.RewardTransaction ||
  mongoose.model("RewardTransaction", rewardTransactionSchema);

export default RewardTransaction;
