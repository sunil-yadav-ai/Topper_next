import mongoose from "mongoose";

const savedScholarshipSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  scholarship: { type: mongoose.Schema.Types.ObjectId, ref: "Scholarship", required: true, index: true },
}, { timestamps: true });

savedScholarshipSchema.index({ user: 1, scholarship: 1 }, { unique: true });

const SavedScholarship =
  mongoose.models.SavedScholarship || mongoose.model("SavedScholarship", savedScholarshipSchema);
export default SavedScholarship;
