import mongoose from "mongoose";
import {
  buildNoteSearchFields,
  createSearchNgrams,
} from "../services/resource-search-index.service.js";

const noteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    department: { type: String, required: true, trim: true, maxlength: 120 },
    batch: { type: String, required: true, trim: true, maxlength: 30 },
    semester: { type: Number, required: true, min: 1, max: 12 },
    subject: { type: String, required: true, trim: true, maxlength: 120 },
    university: { type: String, trim: true, maxlength: 160, default: "" },
    marks: { type: Number, min: 1, max: 100000 },
    unit: { type: String, trim: true, maxlength: 80, default: "" },
    topic: { type: String, trim: true, maxlength: 160, default: "" },
    keywords: [{ type: String, trim: true, maxlength: 80 }],
    tags: [{ type: String, trim: true, maxlength: 80 }],
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
    downloadCount: { type: Number, default: 0, min: 0 },
    helpfulCount: { type: Number, default: 0, min: 0 },
    searchNgrams: { type: [String], default: [], select: false },
    searchIndexVersion: { type: Number, default: 0, select: false },
    storage: {
      provider: { type: String, enum: ["cloudinary"], required: true },
      publicId: { type: String, required: true },
      resourceType: { type: String, enum: ["image", "raw"], required: true },
      format: { type: String, enum: ["pdf", "jpg", "jpeg", "png"], required: true },
      mimeType: { type: String, required: true },
      bytes: { type: Number, required: true, min: 1 },
    },
    previewStorage: {
      provider: { type: String, enum: ["cloudinary"] },
      publicId: { type: String },
      resourceType: { type: String, enum: ["image"] },
      format: { type: String, enum: ["png"] },
      mimeType: { type: String },
      bytes: { type: Number, min: 1 },
    },
    verificationStatus: {
      type: String,
      enum: [
        "queued",
        "processing",
        "completed",
        "verified",
        "rejected",
        "failed",
      ],
      default: "queued",
      index: true,
    },
    verificationError: { type: String, maxlength: 300 },
    approvalDecision: {
      type: String,
      enum: [
        "PENDING",
        "NEEDS_HUMAN_REVIEW",
        "APPROVED",
        "APPROVED_WITH_WARNING",
        "REJECTED",
      ],
      default: "PENDING",
      index: true,
    },
    visibility: {
      type: String,
      enum: ["private", "public"],
      default: "private",
      index: true,
    },
    decisionSource: {
      type: String,
      enum: ["ai", "admin"],
      default: "ai",
      index: true,
    },
    moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    moderatedAt: { type: Date, default: null },
    moderationReason: { type: String, trim: true, maxlength: 2000, default: "" },
    moderationHistory: {
      type: [
        new mongoose.Schema(
          {
            actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
            decision: {
              type: String,
              enum: ["APPROVED", "REJECTED"],
              required: true,
            },
            reason: { type: String, required: true, maxlength: 2000 },
            createdAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    verifiableStatementCount: { type: Number, min: 0, default: 0 },
    confirmedErrorCount: { type: Number, min: 0, default: 0 },
    mistakePercentage: { type: Number, min: 0 },
    humanReviewReason: { type: String, maxlength: 500 },
    publicationStatus: {
      type: String,
      enum: ["private", "published"],
      default: "private",
      index: true,
    },
    ocrStatus: {
      type: String,
      enum: ["queued", "processing", "completed", "failed"],
      default: "queued",
      index: true,
    },
    ocrPageCount: { type: Number, min: 0 },
    ocrError: { type: String, maxlength: 300 },
    revisionRoot: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Note",
      required: true,
      index: true,
    },
    revisionOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Note",
      default: null,
    },
    revisionNumber: { type: Number, min: 1, default: 1 },
  },
  { timestamps: true },
);

noteSchema.pre("validate", function indexNoteMetadata() {
  const searchFields = [
    "title",
    "subject",
    "topic",
    "unit",
    "description",
    "department",
    "university",
    "keywords",
    "tags",
  ];
  if (!this.isNew && !searchFields.some((field) => this.isModified(field))) {
    return;
  }
  this.searchNgrams = createSearchNgrams(buildNoteSearchFields(this));
  this.searchIndexVersion = 1;
});

noteSchema.index({ uploadedBy: 1, createdAt: -1 });
noteSchema.index({ publicationStatus: 1, visibility: 1, searchNgrams: 1 });
noteSchema.index({
  publicationStatus: 1,
  approvalDecision: 1,
  createdAt: -1,
});
noteSchema.index({
  publicationStatus: 1,
  approvalDecision: 1,
  department: 1,
  semester: 1,
  createdAt: -1,
});
noteSchema.index({
  publicationStatus: 1,
  approvalDecision: 1,
  subject: 1,
  unit: 1,
  topic: 1,
});
noteSchema.index({
  publicationStatus: 1,
  approvalDecision: 1,
  university: 1,
});
noteSchema.index({ publicationStatus: 1, approvalDecision: 1, subject: 1 });
noteSchema.index({ publicationStatus: 1, approvalDecision: 1, unit: 1 });
noteSchema.index({ publicationStatus: 1, approvalDecision: 1, topic: 1 });
noteSchema.index({
  publicationStatus: 1,
  approvalDecision: 1,
  helpfulCount: -1,
  createdAt: -1,
});
noteSchema.index({
  title: "text",
  description: "text",
  subject: "text",
  unit: "text",
  topic: "text",
});
noteSchema.index(
  { revisionRoot: 1, revisionNumber: 1 },
  { unique: true, partialFilterExpression: { revisionRoot: { $exists: true } } },
);

const Note = mongoose.models.Note || mongoose.model("Note", noteSchema);

export default Note;
