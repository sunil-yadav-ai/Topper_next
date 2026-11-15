import mongoose from "mongoose";

const resourceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    type: {
      type: String,
      enum: ["note", "pyq", "other"],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    pointsAwarded: { type: Number, min: 0, default: 0 },
  },
  { timestamps: true },
);

resourceSchema.index({ uploadedBy: 1, createdAt: -1 });
resourceSchema.index({ uploadedBy: 1, status: 1, type: 1 });

const Resource = mongoose.models.Resource || mongoose.model("Resource", resourceSchema);

export default Resource;
