import mongoose from "mongoose";

const eligibilityRuleSchema = new mongoose.Schema({
  field: { type: String, required: true, trim: true },
  operator: {
    type: String,
    enum: ["eq", "ne", "gte", "lte", "gt", "lt", "in", "nin", "exists", "contains"],
    required: true,
  },
  value: { type: mongoose.Schema.Types.Mixed, default: null },
  reason: { type: String, trim: true, maxlength: 500, default: "" },
  required: { type: Boolean, default: true },
  verificationRequired: { type: Boolean, default: false },
}, { _id: false });

const scholarshipSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 300 },
  slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 320 },
  description: { type: String, trim: true, maxlength: 5000, default: "" },
  organization: { type: String, required: true, trim: true, maxlength: 300 },
  category: { type: [String], default: [] },
  criteriaCategory: { type: [String], default: [] },
  eligibleCourses: { type: [String], default: [] },
  educationLevels: { type: [String], default: [] },
  amountValue: { type: Number, default: null, min: 0 },
  scholarshipType: { type: String, trim: true, maxlength: 150, default: "" },
  amount: { type: mongoose.Schema.Types.Mixed, default: null },
  amountType: { type: String, enum: ["fixed", "variable", "tuition", "monthly", "yearly", "unknown"], default: "unknown" },
  eligibilityRules: { type: [eligibilityRuleSchema], default: [] },
  eligibilityGroups: { type: mongoose.Schema.Types.Mixed, default: [] },
  requiredDocuments: { type: [String], default: [] },
  educationalRequirements: { type: String, trim: true, maxlength: 3000, default: "" },
  benefits: { type: [String], default: [] },
  stateRequirements: { type: [String], default: [] },
  categoryRequirements: { type: [String], default: [] },
  incomeLimit: { type: Number, default: null, min: 0 },
  applicationStartDate: { type: Date, default: null },
  applicationDeadline: { type: Date, default: null },
  selectionProcess: { type: String, trim: true, maxlength: 3000, default: "" },
  applicationInstructions: { type: String, trim: true, maxlength: 5000, default: "" },
  academicYear: { type: String, trim: true, maxlength: 30, default: "" },
  applicationStatus: { type: String, enum: ["open", "closed", "upcoming", "unknown"], default: "unknown", index: true },
  applicationStatusVerified: { type: Boolean, default: false, index: true },
  applicationStatusVerifiedAt: { type: Date, default: null },
  officialSourceUrl: { type: String, required: true, trim: true, maxlength: 2048 },
  officialGuidelineUrl: { type: String, trim: true, maxlength: 2048, default: "" },
  officialFaqUrl: { type: String, trim: true, maxlength: 2048, default: "" },
  sourceListingUrl: { type: String, trim: true, maxlength: 2048, default: "" },
  officialApplicationUrl: { type: String, trim: true, maxlength: 2048, default: "" },
  sourceName: { type: String, trim: true, maxlength: 200, default: "" },
  sourceIdentifier: { type: String, trim: true, maxlength: 500, default: "" },
  verificationStatus: { type: String, enum: ["pending", "verified", "unverified", "rejected"], default: "pending", index: true },
  publicationStatus: { type: String, enum: ["draft", "published", "expired", "closed"], default: "draft", index: true },
  confidenceScore: { type: Number, min: 0, max: 100, default: 0 },
  isFeatured: { type: Boolean, default: false, index: true },
  lastVerifiedAt: { type: Date, default: null },
  lastCheckedAt: { type: Date, default: null },
  sourceHistory: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });

scholarshipSchema.index({ publicationStatus: 1, applicationDeadline: 1 });
scholarshipSchema.index({ stateRequirements: 1, scholarshipType: 1 });
scholarshipSchema.index({ educationLevels: 1, scholarshipType: 1 });
scholarshipSchema.index({ title: "text", organization: "text", description: "text" });
scholarshipSchema.index({ title: 1, organization: 1 });
scholarshipSchema.index({ sourceName: 1, sourceIdentifier: 1 }, { unique: true, sparse: true });
scholarshipSchema.index({ slug: 1 }, { unique: true });

const Scholarship = mongoose.models.Scholarship || mongoose.model("Scholarship", scholarshipSchema);
export default Scholarship;
