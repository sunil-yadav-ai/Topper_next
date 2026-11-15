import mongoose from "mongoose";

const studentResourceAccessSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      enum: ["note", "pyq"],
      required: true,
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    lastAccessedAt: { type: Date, default: null },
    lastDownloadedAt: { type: Date, default: null },
    downloadCount: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
);

studentResourceAccessSchema.index(
  { user: 1, resourceType: 1, resource: 1 },
  { unique: true },
);
studentResourceAccessSchema.index({ user: 1, lastAccessedAt: -1 });
studentResourceAccessSchema.index({ user: 1, lastDownloadedAt: -1 });

const StudentResourceAccess =
  mongoose.models.StudentResourceAccess ||
  mongoose.model("StudentResourceAccess", studentResourceAccessSchema);

export default StudentResourceAccess;
