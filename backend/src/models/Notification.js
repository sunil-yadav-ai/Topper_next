import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "note_uploaded",
        "verification_started",
        "note_approved",
        "note_rejected",
        "corrections_required",
        "mistake_reported",
        "mistake_resolved",
        "points_awarded",
        "announcement",
        "followed_note_uploaded",
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 2000 },
    link: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
      validate: {
        validator(value) {
          return !value || (value.startsWith("/") && !value.startsWith("//"));
        },
        message: "Notification links must be relative platform paths.",
      },
    },
    dedupeKey: { type: String, required: true, maxlength: 200 },
    readAt: { type: Date, default: null, index: true },
  },
  { timestamps: true },
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, dedupeKey: 1 }, { unique: true });

const Notification =
  mongoose.models.Notification || mongoose.model("Notification", notificationSchema);

export default Notification;
