import mongoose from "mongoose";

const pyqReportSchema = new mongoose.Schema(
  {
    pyq: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pyq",
      required: true,
      index: true,
    },
    reportedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    reason: {
      type: String,
      required: true,
      enum: ["incorrect", "duplicate", "other"],
    },
    details: { type: String, trim: true, maxlength: 1000, default: "" },
    status: {
      type: String,
      enum: ["open", "reviewed", "dismissed"],
      default: "open",
      index: true,
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { timestamps: true },
);

pyqReportSchema.index({ pyq: 1, reportedBy: 1 }, { unique: true });

const PyqReport = mongoose.models.PyqReport || mongoose.model("PyqReport", pyqReportSchema);

export default PyqReport;
