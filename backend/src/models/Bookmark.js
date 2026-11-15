import mongoose from "mongoose";

const bookmarkSchema = new mongoose.Schema(
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
    folder: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "Saved",
    },
  },
  { timestamps: true },
);

bookmarkSchema.index(
  { user: 1, resourceType: 1, resource: 1 },
  { unique: true },
);
bookmarkSchema.index({ user: 1, folder: 1, updatedAt: -1 });

const Bookmark = mongoose.models.Bookmark || mongoose.model("Bookmark", bookmarkSchema);

export default Bookmark;
