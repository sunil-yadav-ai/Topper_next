import mongoose from "mongoose";

const followSchema = new mongoose.Schema(
  {
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    followedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

followSchema.index({ follower: 1, followedUser: 1 }, { unique: true });
followSchema.index({ followedUser: 1, createdAt: -1 });
followSchema.index({ follower: 1, createdAt: -1 });

const Follow = mongoose.models.Follow || mongoose.model("Follow", followSchema);

export default Follow;
