import mongoose from "mongoose";

const noteVerificationHistorySchema = new mongoose.Schema(
  {
    note: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Note",
      required: true,
      index: true,
    },
    revisionRoot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Note",
      required: true,
      index: true,
    },
    attempt: { type: Number, required: true, min: 1 },
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
    encryptedReport: {
      type: new mongoose.Schema(
        {
          algorithm: { type: String, enum: ["aes-256-gcm"], required: true },
          iv: { type: String, required: true },
          authTag: { type: String, required: true },
          ciphertext: { type: String, required: true },
        },
        { _id: false },
      ),
      required: true,
      select: false,
    },
    model: { type: String, required: true },
  },
  { timestamps: true },
);

noteVerificationHistorySchema.index(
  { note: 1, attempt: 1 },
  { unique: true },
);

const NoteVerificationHistory =
  mongoose.models.NoteVerificationHistory ||
  mongoose.model("NoteVerificationHistory", noteVerificationHistorySchema);

export default NoteVerificationHistory;
