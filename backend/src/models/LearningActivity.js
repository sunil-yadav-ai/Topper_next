import mongoose from "mongoose";

const learningActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      enum: ["note", "pyq"],
      required: true,
    },
    resourceTitle: { type: String, required: true, maxlength: 260 },
    openId: { type: String, required: true, maxlength: 80 },
    activityDate: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Activity date must use YYYY-MM-DD."],
    },
    openedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true },
);

learningActivitySchema.index({ userId: 1, activityDate: -1 });
learningActivitySchema.index({ userId: 1, resourceId: 1, openedAt: -1 });
learningActivitySchema.index({ userId: 1, openId: 1 }, { unique: true });

const LearningActivity =
  mongoose.models.LearningActivity || mongoose.model("LearningActivity", learningActivitySchema);

export default LearningActivity;
