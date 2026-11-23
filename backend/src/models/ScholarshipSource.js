import mongoose from "mongoose";

const scholarshipSourceSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  url: { type: String, required: true, trim: true, maxlength: 2048 },
  sourceType: { type: String, enum: ["api", "rss", "announcement", "website"], required: true },
  authorityType: { type: String, enum: ["government", "private", "corporate", "university", "foundation"], required: true },
  sourceCategory: { type: String, enum: ["national", "state", "private", "corporate", "university", "research"], default: "national", index: true },
  state: { type: String, trim: true, maxlength: 100, default: "" },
  collectorKey: { type: String, trim: true, maxlength: 100, default: "" },
  enabled: { type: Boolean, default: true, index: true },
  monitoringStatus: { type: String, enum: ["active", "partial", "unavailable", "restricted", "not_integrated", "disabled"], default: "active" },
  limitation: { type: String, trim: true, maxlength: 1000, default: "" },
  lastCheckedAt: { type: Date, default: null },
  lastSuccessfulAt: { type: Date, default: null },
  lastDiscovered: { type: Number, default: 0, min: 0 },
  lastUpdated: { type: Number, default: 0, min: 0 },
  lastDeduplicated: { type: Number, default: 0, min: 0 },
  lastSyncDurationMs: { type: Number, default: null, min: 0 },
  lastError: { type: String, trim: true, maxlength: 1000, default: "" },
}, { timestamps: true });

scholarshipSourceSchema.index({ url: 1 }, { unique: true });
const ScholarshipSource =
  mongoose.models.ScholarshipSource || mongoose.model("ScholarshipSource", scholarshipSourceSchema);
export default ScholarshipSource;
