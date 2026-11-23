import mongoose from "mongoose";

const scholarshipNotificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  scholarship: { type: mongoose.Schema.Types.ObjectId, ref: "Scholarship", default: null, index: true },
  type: { type: String, enum: ["new_match", "deadline_soon", "deadline_extended", "eligibility_changed", "saved_closing"], required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  link: { type: String, trim: true, maxlength: 500, default: "" },
  dedupeKey: { type: String, required: true, maxlength: 300 },
  readAt: { type: Date, default: null },
}, { timestamps: true });

scholarshipNotificationSchema.index({ recipient: 1, dedupeKey: 1 }, { unique: true });
scholarshipNotificationSchema.index({ recipient: 1, createdAt: -1 });

const ScholarshipNotification =
  mongoose.models.ScholarshipNotification ||
  mongoose.model("ScholarshipNotification", scholarshipNotificationSchema);
export default ScholarshipNotification;
