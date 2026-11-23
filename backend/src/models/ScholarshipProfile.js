import mongoose from "mongoose";

const scholarshipProfileSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true, index: true },
  fullName: { type: String, required: true, trim: true, maxlength: 100 },
  dateOfBirth: { type: Date, required: true },
  gender: { type: String, enum: ["female", "male", "other", "prefer_not_to_say"], required: true },
  state: { type: String, required: true, trim: true, maxlength: 100 },
  district: { type: String, required: true, trim: true, maxlength: 100 },
  domicileState: { type: String, required: true, trim: true, maxlength: 100 },
  category: { type: String, enum: ["", "general", "sc", "st", "obc", "ews", "other"], default: "" },
  minorityStatus: { type: String, enum: ["", "yes", "no"], default: "" },
  disabilityStatus: { type: String, enum: ["", "none", "yes"], default: "" },
  educationLevel: { type: String, required: true, trim: true, maxlength: 120 },
  courseName: { type: String, required: true, trim: true, maxlength: 150 },
  currentAcademicYear: { type: String, required: true, trim: true, maxlength: 30 },
  collegeName: { type: String, required: true, trim: true, maxlength: 200 },
  universityRegistrationNumber: { type: String, trim: true, maxlength: 100, default: "" },
  tenthPercentage: { type: Number, min: 0, max: 100, default: null },
  twelfthPercentage: { type: Number, min: 0, max: 100, default: null },
  currentSemesterPercentage: { type: Number, min: 0, max: 100, default: null },
  previousExamPercentage: { type: Number, min: 0, max: 100, default: null },
  annualFamilyIncome: { type: Number, required: true, min: 0 },
  incomeCertificateAvailable: { type: Boolean, default: false },
  bplStatus: { type: Boolean, default: false },
  residenceType: { type: String, enum: ["", "hostel", "day_scholar"], default: "" },
  domicileCertificateAvailable: { type: Boolean, default: false },
  aadhaarAvailable: { type: Boolean, default: false },
  bankAccountAvailable: { type: Boolean, default: false },
  netJrfQualified: { type: Boolean, default: null },
  researchRegistrationWithinStipulatedPeriod: { type: Boolean, default: null },
  profileCompletedAt: { type: Date, default: null },
}, { timestamps: true });

const ScholarshipProfile =
  mongoose.models.ScholarshipProfile ||
  mongoose.model("ScholarshipProfile", scholarshipProfileSchema);
export default ScholarshipProfile;
