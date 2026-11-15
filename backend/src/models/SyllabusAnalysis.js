import mongoose from "mongoose";

const encryptedAnalysisSchema = new mongoose.Schema(
  {
    algorithm: { type: String, enum: ["aes-256-gcm"], required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    ciphertext: { type: String, required: true },
  },
  { _id: false },
);

const syllabusAnalysisSchema = new mongoose.Schema(
  {
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sourceHash: { type: String, select: false },
    fileName: { type: String, required: true, maxlength: 255 },
    pageCount: { type: Number, min: 1, default: 1 },
    status: {
      type: String,
      enum: ["processing", "review", "confirmed", "failed"],
      default: "processing",
      index: true,
    },
    processingError: { type: String, maxlength: 300 },
    encryptedAnalysis: {
      type: encryptedAnalysisSchema,
      required: true,
      select: false,
    },
  },
  { timestamps: true },
);

syllabusAnalysisSchema.index({ uploadedBy: 1, createdAt: -1 });
syllabusAnalysisSchema.index(
  { uploadedBy: 1, sourceHash: 1 },
  { unique: true, partialFilterExpression: { sourceHash: { $type: "string" } } },
);

const SyllabusAnalysis =
  mongoose.models.SyllabusAnalysis || mongoose.model("SyllabusAnalysis", syllabusAnalysisSchema);

export default SyllabusAnalysis;
