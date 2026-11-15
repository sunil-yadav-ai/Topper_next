import mongoose from "mongoose";

const rewardAccountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    points: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
);

const RewardAccount =
  mongoose.models.RewardAccount || mongoose.model("RewardAccount", rewardAccountSchema);

export default RewardAccount;
