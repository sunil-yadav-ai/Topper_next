import bcrypt from "bcryptjs";
import mongoose from "mongoose";

const suspensionHistorySchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: ["suspended", "reinstated"], required: true },
    reason: { type: String, required: true, maxlength: 500 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address."],
    },
    username: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      minlength: 3,
      maxlength: 30,
      match: [/^[a-z0-9](?:[a-z0-9._]{1,28}[a-z0-9])$/, "Enter a valid username."],
    },
    bio: { type: String, trim: true, maxlength: 300, default: "" },
    course: { type: String, trim: true, maxlength: 120, default: "" },
    password: {
      type: String,
      required: true,
      select: false,
      minlength: 8,
      maxlength: 72,
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    college: { type: String, required: true, trim: true, maxlength: 120 },
    university: { type: String, required: true, trim: true, maxlength: 120 },
    department: { type: String, required: true, trim: true, maxlength: 120 },
    batch: { type: String, required: true, trim: true, maxlength: 30 },
    semester: { type: Number, required: true, min: 1, max: 12 },
    isSuspended: { type: Boolean, default: false, index: true },
    suspendedAt: { type: Date, default: null },
    suspendedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    suspensionReason: { type: String, trim: true, maxlength: 500, default: "" },
    suspensionHistory: { type: [suspensionHistorySchema], default: [] },
    avatarUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: "",
      validate: {
        validator(value) {
          if (!value) return true;
          try {
            return ["http:", "https:"].includes(new URL(value).protocol);
          } catch {
            return false;
          }
        },
        message: "Profile picture URL must use HTTP or HTTPS.",
      },
    },
    avatarPublicId: { type: String, select: false },
    coverImage: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: "",
      validate: {
        validator(value) {
          if (!value) return true;
          try {
            return ["http:", "https:"].includes(new URL(value).protocol);
          } catch {
            return false;
          }
        },
        message: "Cover image URL must use HTTP or HTTPS.",
      },
    },
    coverImagePublicId: { type: String, select: false },
    savedResources: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Resource" }],
      default: [],
      select: false,
    },
    savedPyqs: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Pyq" }],
      default: [],
      select: false,
    },
    emailVerified: { type: Boolean, default: false },
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpiresAt: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpiresAt: { type: Date, select: false },
    authVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

userSchema.pre("save", async function hashPassword() {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});

userSchema.index({ university: 1 });
userSchema.index({ college: 1 });
userSchema.index({ batch: 1 });
userSchema.index(
  { username: 1 },
  { unique: true, partialFilterExpression: { username: { $type: "string" } } },
);

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.password);
};

userSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this.id,
    fullName: this.fullName,
    email: this.email,
    username: this.username,
    bio: this.bio,
    course: this.course,
    role: this.role,
    college: this.college,
    university: this.university,
    department: this.department,
    batch: this.batch,
    semester: this.semester,
    avatarUrl: this.avatarUrl,
    coverImage: this.coverImage,
    emailVerified: this.emailVerified,
  };
};

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
