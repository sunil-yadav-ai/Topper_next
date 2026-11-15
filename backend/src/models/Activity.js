import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["profile_updated", "resource_saved", "resource_unsaved"],
      required: true,
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Resource",
    },
    resourceTitle: { type: String, trim: true, maxlength: 200 },
  },
  { timestamps: true },
);

activitySchema.index({ user: 1, createdAt: -1 });

const Activity = mongoose.models.Activity || mongoose.model("Activity", activitySchema);

export default Activity;
