import mongoose from "mongoose";

const scholarshipEligibilityResultSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  scholarship: { type: mongoose.Schema.Types.ObjectId, ref: "Scholarship", required: true, index: true },
  result: {
    type: String,
    enum: ["ELIGIBLE", "NOT_ELIGIBLE", "MORE_INFORMATION_REQUIRED", "VERIFICATION_REQUIRED"],
    required: true,
  },
  reasons: { type: [String], default: [] },
  missingFields: { type: [String], default: [] },
  verificationRequired: { type: [String], default: [] },
  criteria: { type: [mongoose.Schema.Types.Mixed], default: [] },
  evaluatedAt: { type: Date, required: true },
  profileUpdatedAt: { type: Date, default: null },
  scholarshipUpdatedAt: { type: Date, default: null },
}, { timestamps: true });

scholarshipEligibilityResultSchema.index({ user: 1, scholarship: 1 }, { unique: true });

const ScholarshipEligibilityResult =
  mongoose.models.ScholarshipEligibilityResult ||
  mongoose.model("ScholarshipEligibilityResult", scholarshipEligibilityResultSchema);
export default ScholarshipEligibilityResult;
