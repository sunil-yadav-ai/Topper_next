import mongoose from "mongoose";

const correctionHistorySchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    actorRole: { type: String, enum: ["student", "admin"], required: true },
    action: {
      type: String,
      enum: ["reported", "uploader_responded", "confirmed", "dismissed"],
      required: true,
    },
    message: { type: String, maxlength: 2000, default: "" },
    status: {
      type: String,
      enum: ["open", "confirmed", "dismissed"],
      required: true,
    },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const noteCommunityReportSchema = new mongoose.Schema(
  {
    note: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Note",
      required: true,
      index: true,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    pageNumber: { type: Number, required: true, min: 1, max: 10000 },
    category: {
      type: String,
      enum: [
        "incorrect_definition",
        "wrong_formula",
        "incorrect_calculation",
        "missing_explanation",
        "poor_readability",
        "duplicate_content",
      ],
      required: true,
    },
    explanation: { type: String, required: true, trim: true, maxlength: 2000 },
    suggestedCorrection: { type: String, trim: true, maxlength: 2000, default: "" },
    uploaderResponse: { type: String, trim: true, maxlength: 2000, default: "" },
    status: {
      type: String,
      enum: ["open", "confirmed", "dismissed"],
      default: "open",
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    history: { type: [correctionHistorySchema], default: [] },
  },
  { timestamps: true },
);

noteCommunityReportSchema.index({ note: 1, createdAt: -1 });
noteCommunityReportSchema.index({ status: 1, createdAt: 1 });
noteCommunityReportSchema.index({ reportedBy: 1, createdAt: -1 });
noteCommunityReportSchema.index(
  { note: 1, reportedBy: 1, pageNumber: 1, category: 1 },
  { unique: true },
);

const NoteCommunityReport =
  mongoose.models.NoteCommunityReport ||
  mongoose.model("NoteCommunityReport", noteCommunityReportSchema);

export default NoteCommunityReport;
