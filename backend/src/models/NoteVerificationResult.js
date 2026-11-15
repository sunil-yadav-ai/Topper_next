import mongoose from "mongoose";

const encryptedReportSchema = new mongoose.Schema(
  {
    algorithm: { type: String, enum: ["aes-256-gcm"], required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    ciphertext: { type: String, required: true },
  },
  { _id: false },
);

const noteVerificationResultSchema = new mongoose.Schema(
  {
    note: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Note",
      required: true,
      unique: true,
    },
    encryptedReport: {
      type: encryptedReportSchema,
      required: true,
      select: false,
    },
    model: { type: String, required: true },
    referenceCount: { type: Number, min: 0, required: true },
    decision: {
      type: String,
      enum: [
        "NEEDS_HUMAN_REVIEW",
        "APPROVED",
        "APPROVED_WITH_WARNING",
        "REJECTED",
      ],
      required: true,
    },
    verifiableStatementCount: { type: Number, min: 0, required: true },
    confirmedErrorCount: { type: Number, min: 0, required: true },
    mistakePercentage: { type: Number, min: 0, default: null },
    humanReviewReason: { type: String, maxlength: 500, default: "" },
  },
  { timestamps: true },
);

const NoteVerificationResult =
  mongoose.models.NoteVerificationResult ||
  mongoose.model("NoteVerificationResult", noteVerificationResultSchema);

export default NoteVerificationResult;
