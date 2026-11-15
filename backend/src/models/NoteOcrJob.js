import mongoose from "mongoose";

const noteOcrJobSchema = new mongoose.Schema(
  {
    note: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Note",
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
      index: true,
    },
    attempts: { type: Number, default: 0, min: 0 },
    leaseAt: { type: Date },
    retryAt: { type: Date },
    lastError: { type: String, maxlength: 300 },
  },
  { timestamps: true },
);

noteOcrJobSchema.index({ status: 1, createdAt: 1 });

const NoteOcrJob = mongoose.models.NoteOcrJob || mongoose.model("NoteOcrJob", noteOcrJobSchema);

export default NoteOcrJob;
