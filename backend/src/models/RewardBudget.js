import mongoose from "mongoose";

const rewardBudgetSchema = new mongoose.Schema(
  {
    _id: { type: String, default: "platform" },
    initialPoints: { type: Number, required: true, min: 0 },
    availablePoints: { type: Number, required: true, min: 0 },
    distributedPoints: { type: Number, required: true, min: 0, default: 0 },
    reclaimedPoints: { type: Number, required: true, min: 0, default: 0 },
  },
  { timestamps: true },
);

const RewardBudget = mongoose.models.RewardBudget || mongoose.model("RewardBudget", rewardBudgetSchema);

export default RewardBudget;
