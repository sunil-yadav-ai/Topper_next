import mongoose from "mongoose";

const dailyLearningActivitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    activityDate: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Activity date must use YYYY-MM-DD."],
    },
    totalResourcesOpened: { type: Number, min: 1, required: true },
    notesOpened: { type: Number, min: 0, required: true },
    pyqsOpened: { type: Number, min: 0, required: true },
    lastOpenedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

dailyLearningActivitySchema.index(
  { userId: 1, activityDate: 1 },
  { unique: true },
);
dailyLearningActivitySchema.index({ userId: 1, activityDate: -1 });

const DailyLearningActivity =
  mongoose.models.DailyLearningActivity ||
  mongoose.model("DailyLearningActivity", dailyLearningActivitySchema);

export default DailyLearningActivity;
