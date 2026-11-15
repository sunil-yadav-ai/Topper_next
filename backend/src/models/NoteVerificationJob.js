import mongoose from "mongoose";

const noteVerificationJobSchema = new mongoose.Schema(
  {
    note: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Note",
      required: true,
      unique: true,
    },
    verificationType: {
      type: String,
      enum: ["ai_handwritten_note"],
      default: "ai_handwritten_note",
      required: true,
    },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    leaseAt: { type: Date },
    lastError: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);

noteVerificationJobSchema.index({ status: 1, createdAt: 1 });

const NoteVerificationJob =
  mongoose.models.NoteVerificationJob ||
  mongoose.model("NoteVerificationJob", noteVerificationJobSchema);

export default NoteVerificationJob;
