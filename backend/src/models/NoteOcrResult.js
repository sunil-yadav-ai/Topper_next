import mongoose from "mongoose";

const encryptedOcrSchema = new mongoose.Schema(
  {
    algorithm: { type: String, enum: ["aes-256-gcm"], required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    ciphertext: { type: String, required: true },
  },
  { _id: false },
);

const noteOcrResultSchema = new mongoose.Schema(
  {
    note: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Note",
      required: true,
      unique: true,
    },
    encryptedResult: { type: encryptedOcrSchema, required: true, select: false },
  },
  { timestamps: true },
);

const NoteOcrResult =
  mongoose.models.NoteOcrResult || mongoose.model("NoteOcrResult", noteOcrResultSchema);

export default NoteOcrResult;
