import mongoose from "mongoose";
import {
  buildPyqSearchFields,
  createSearchNgrams,
} from "../services/resource-search-index.service.js";

const pyqSchema = new mongoose.Schema(
  {
    university: { type: String, required: true, trim: true, maxlength: 160 },
    college: { type: String, required: true, trim: true, maxlength: 160 },
    department: { type: String, required: true, trim: true, maxlength: 120 },
    course: { type: String, required: true, trim: true, maxlength: 120 },
    semester: { type: Number, required: true, min: 1, max: 12, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 160, index: true },
    title: { type: String, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    keywords: [{ type: String, trim: true, maxlength: 80 }],
    tags: [{ type: String, trim: true, maxlength: 80 }],
    examinationYear: {
      type: Number,
      required: true,
      min: 1900,
      max: new Date().getFullYear() + 1,
      index: true,
    },
    examType: {
      type: String,
      required: true,
      enum: [
        "Mid Semester",
        "End Semester",
        "Internal",
        "External",
        "Midterm",
        "Final",
        "Supplementary",
        "Quiz",
        "Other",
      ],
      index: true,
    },
    publicationStatus: {
      type: String,
      enum: ["private", "published"],
      default: "published",
      index: true,
    },
    visibility: {
      type: String,
      enum: ["private", "public"],
      default: "public",
      index: true,
    },
    fileName: { type: String, required: true, maxlength: 255 },
    emailNotificationStatus: {
      type: String,
      enum: ["pending", "sending", "sent", "failed"],
      default: "pending",
      select: false,
    },
    emailNotificationSentAt: { type: Date, default: null, select: false },
    storage: {
      provider: { type: String, enum: ["cloudinary"], required: true },
      publicId: { type: String, required: true },
      resourceType: { type: String, enum: ["raw"], required: true },
      accessType: { type: String, enum: ["authenticated", "upload"], default: "authenticated" },
      format: { type: String, enum: ["pdf", "jpg", "jpeg", "png"], default: "pdf" },
      mimeType: { type: String, default: "application/pdf" },
      bytes: { type: Number, required: true, min: 1, max: 20 * 1024 * 1024 },
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    downloadCount: { type: Number, default: 0, min: 0 },
    helpfulCount: { type: Number, default: 0, min: 0 },
    reportCount: { type: Number, default: 0, min: 0 },
    searchNgrams: { type: [String], default: [], select: false },
    searchIndexVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

pyqSchema.pre("validate", function indexPyqMetadata() {
  const searchFields = [
    "title",
    "subject",
    "description",
    "university",
    "college",
    "department",
    "course",
    "examType",
    "fileName",
  ];
  if (!this.isNew && !searchFields.some((field) => this.isModified(field))) {
    return;
  }
  this.searchNgrams = createSearchNgrams(buildPyqSearchFields(this));
  this.searchIndexVersion = 1;
});

pyqSchema.index({ createdAt: -1 });
pyqSchema.index({ publicationStatus: 1, visibility: 1, searchNgrams: 1 });
pyqSchema.index({ publicationStatus: 1, visibility: 1, createdAt: -1 });
pyqSchema.index({ publicationStatus: 1, visibility: 1, helpfulCount: -1, createdAt: -1 });
pyqSchema.index({ publicationStatus: 1, visibility: 1, uploadedBy: 1, createdAt: -1 });
pyqSchema.index({ publicationStatus: 1, visibility: 1, subject: 1 });
pyqSchema.index({
  publicationStatus: 1,
  visibility: 1,
  department: 1,
  semester: 1,
  subject: 1,
});
pyqSchema.index({
  university: 1,
  department: 1,
  course: 1,
  semester: 1,
  subject: 1,
  examinationYear: -1,
});
pyqSchema.index({
  university: "text",
  college: "text",
  department: "text",
  course: "text",
  subject: "text",
  examType: "text",
  fileName: "text",
});

const Pyq = mongoose.models.Pyq || mongoose.model("Pyq", pyqSchema);

export default Pyq;
