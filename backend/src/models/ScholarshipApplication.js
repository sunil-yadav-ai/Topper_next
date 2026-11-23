import mongoose from "mongoose";

const scholarshipApplicationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  scholarship: { type: mongoose.Schema.Types.ObjectId, ref: "Scholarship", required: true, index: true },
  applicationId: { type: String, trim: true, maxlength: 200, default: "" },
  applicationDate: { type: Date, default: null },
  status: {
    type: String,
    enum: ["intended", "in_progress", "submitted", "approved", "rejected"],
    default: "intended",
    index: true,
  },
  eligibilityResult: { type: mongoose.Schema.Types.Mixed, default: null },
  intentRecordedAt: { type: Date, default: Date.now },
  redirectedAt: { type: Date, default: null },
  notes: { type: String, trim: true, maxlength: 2000, default: "" },
}, { timestamps: true });

scholarshipApplicationSchema.index({ user: 1, scholarship: 1 }, { unique: true });
scholarshipApplicationSchema.index({ user: 1, status: 1, updatedAt: -1 });

const ScholarshipApplication =
  mongoose.models.ScholarshipApplication ||
  mongoose.model("ScholarshipApplication", scholarshipApplicationSchema);
export default ScholarshipApplication;
