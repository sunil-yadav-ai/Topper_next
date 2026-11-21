import User from "../models/User.js";
import { sendActionEmail } from "../services/email.service.js";
import {
  authCookieName,
  createEmailVerificationCode,
  createActionToken,
  createActionUrl,
  getAuthCookieOptions,
  getClearCookieOptions,
  hashEmailVerificationCode,
  hashActionToken,
  legacyAuthCookiePath,
  signAuthToken,
  normalizeIndianMobile,
  isValidIndianMobile,
  validatePassword,
} from "../services/auth.service.js";
import { createUniqueUsername } from "../services/username.service.js";

const actionTokenLifetimeMs = 60 * 60 * 1000;
const verificationCodeLifetimeMs = 10 * 60 * 1000;
const maxVerificationCodeAttempts = 5;

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function unauthorized(message = "Email or password is incorrect.") {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

function normalizeLoginIdentifier(identifier) {
  return typeof identifier === "string" ? identifier.trim() : "";
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function escapedExact(value) {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function requireActionToken(token) {
  if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
    throw badRequest("This link is invalid or has expired.");
  }
}

async function deliverVerificationCode(user, code, sendEmail = sendActionEmail) {
  await sendEmail({
    to: user.email,
    subject: "Your StudyShare verification code",
    text: `Hi ${user.fullName},\n\nYour email verification code is ${code}.\n\nEnter this code to activate your account. It expires in 10 minutes.`,
  });
}

export async function registerStudent(request, response, dependencies = {}) {
  const {
    fullName,
    email,
    phoneNumber,
    password,
    university,
    department,
    batch,
    semester,
  } = request.body ?? {};

  if (
    !isNonEmptyString(fullName) ||
    !isNonEmptyString(university) ||
    !isNonEmptyString(department) ||
    !isNonEmptyString(batch) ||
    !Number.isInteger(Number(semester)) ||
    Number(semester) < 1 ||
    Number(semester) > 12
  ) {
    throw badRequest("Complete all student profile fields with a valid semester (1–12).");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email))) {
    throw badRequest("Enter a valid email address.");
  }
  if (!isValidIndianMobile(phoneNumber)) {
    throw badRequest("Enter a valid 10-digit Indian mobile number or a number with +91.");
  }
  if (!validatePassword(password)) {
    throw badRequest("Password must be at least 8 characters and no more than 72 UTF-8 bytes.");
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedPhoneNumber = normalizeIndianMobile(phoneNumber);
  const existingEmail = await User.exists({ email: normalizedEmail });
  if (existingEmail) {
    const pendingUser = await User.findOne({ email: normalizedEmail }).select(
      "+emailVerificationRequired +emailVerificationTokenHash +emailVerificationExpiresAt +emailVerificationAttempts",
    );
    if (!pendingUser || pendingUser.emailVerified || !pendingUser.emailVerificationRequired) {
      throw badRequest("An account already exists for this email. Sign in or request a new verification code.");
    }

    if (await User.exists({ phoneNumber: normalizedPhoneNumber })) {
      const phoneOwner = await User.findOne({
        phoneNumber: normalizedPhoneNumber,
      }).select("_id email");
      const pendingId = String(pendingUser._id ?? pendingUser.id);
      const phoneOwnerId = String(phoneOwner?._id ?? phoneOwner?.id ?? "");
      if (!phoneOwner || phoneOwnerId !== pendingId) {
        throw badRequest("An account already exists for this mobile number.");
      }
    }

    const verificationCode = createEmailVerificationCode();
    pendingUser.fullName = fullName;
    pendingUser.phoneNumber = normalizedPhoneNumber;
    pendingUser.phoneVerified = false;
    pendingUser.password = password;
    pendingUser.university = university;
    pendingUser.department = department;
    pendingUser.batch = batch;
    pendingUser.semester = Number(semester);
    pendingUser.emailVerified = false;
    pendingUser.emailVerificationRequired = true;
    pendingUser.emailVerificationTokenHash =
      hashEmailVerificationCode(normalizedEmail, verificationCode);
    pendingUser.emailVerificationExpiresAt =
      new Date(Date.now() + verificationCodeLifetimeMs);
    pendingUser.emailVerificationAttempts = 0;
    await pendingUser.save();
    await deliverVerificationCode(pendingUser, verificationCode, dependencies.sendEmail);

    response.status(201).json({
      status: "success",
      message: "We sent a fresh 6-digit verification code to your email. It expires in 10 minutes.",
    });
    return;
  }

  if (await User.exists({ phoneNumber: normalizedPhoneNumber })) {
    throw badRequest("An account already exists for this mobile number.");
  }

  const username = await createUniqueUsername(User, fullName);
  const verificationCode = createEmailVerificationCode();
  const user = await User.create({
    fullName,
    email: normalizedEmail,
    phoneNumber: normalizedPhoneNumber,
    phoneVerified: false,
    username,
    password,
    university,
    department,
    batch,
    semester: Number(semester),
    role: "user",
    emailVerified: false,
    emailVerificationRequired: true,
    emailVerificationTokenHash: hashEmailVerificationCode(email, verificationCode),
    emailVerificationExpiresAt: new Date(Date.now() + verificationCodeLifetimeMs),
    emailVerificationAttempts: 0,
  });
  await deliverVerificationCode(user, verificationCode, dependencies.sendEmail);

  response.status(201).json({
    status: "success",
    message: "We sent a 6-digit verification code to your email. It expires in 10 minutes.",
  });
}

async function authenticate(request, response, requiredRole) {
  const identifier = normalizeLoginIdentifier(
    request.body?.identifier ?? request.body?.email,
  );
  const password = request.body?.password;

  if (!identifier || typeof password !== "string") {
    throw badRequest("Email or username and password are required.");
  }
  if (identifier.length > 254) {
    throw badRequest("Email or username is too long.");
  }

  const loginField = identifier.includes("@") ? "email" : "username";
  const user = await User.findOne({
    [loginField]: escapedExact(identifier),
  }).select("+password +authVersion +emailVerificationRequired");
  if (!user || !(await user.comparePassword(password))) {
    throw unauthorized();
  }
  if (requiredRole && user.role !== requiredRole) {
    throw unauthorized();
  }
  if (user.emailVerificationRequired && !user.emailVerified) {
    throw unauthorized("Verify your email with the code we sent before signing in.");
  }
  if (user.isSuspended) {
    throw unauthorized("This account is suspended. Contact an administrator.");
  }
  response.clearCookie(authCookieName, {
    ...getClearCookieOptions(),
    path: legacyAuthCookiePath,
  });
  response.cookie(authCookieName, signAuthToken(user), getAuthCookieOptions());
  response.json({ status: "success", user: user.toSafeObject() });
}

export async function loginStudent(request, response) {
  await authenticate(request, response, "user");
}

export async function loginAdmin(request, response) {
  await authenticate(request, response, "admin");
}

export async function getCurrentUser(request, response) {
  response.clearCookie(authCookieName, {
    ...getClearCookieOptions(),
    path: legacyAuthCookiePath,
  });
  response.cookie(authCookieName, signAuthToken(request.user), getAuthCookieOptions());
  response.json({ status: "success", user: request.user.toSafeObject() });
}

export function logout(request, response) {
  response.clearCookie(authCookieName, getClearCookieOptions());
  response.clearCookie(authCookieName, {
    ...getClearCookieOptions(),
    path: legacyAuthCookiePath,
  });
  response.json({ status: "success", message: "You have been signed out." });
}

async function reloadVerifiedAuthUser(user) {
  if (user?.authVersion !== undefined) return user;
  const userId = user?._id ?? user?.id;
  if (!userId) return user;
  return (await User.findById(userId).select("+authVersion")) ?? user;
}

export async function verifyEmail(request, response) {
  const { token, email: submittedEmail, code } = request.body ?? {};
  const email = normalizeEmail(submittedEmail);
  const now = new Date();
  let user;
  let tokenHash;

  if (token) {
    requireActionToken(token);
    tokenHash = hashActionToken(token);
    user = await User.findOneAndUpdate(
      {
        emailVerificationTokenHash: tokenHash,
        emailVerificationExpiresAt: { $gt: now },
      },
      {
        $set: { emailVerified: true, emailVerificationRequired: false },
        $unset: {
          emailVerificationTokenHash: "",
          emailVerificationExpiresAt: "",
          emailVerificationAttempts: "",
        },
      },
      { new: true },
    );
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code ?? "")) {
      throw badRequest("Enter a valid email address and 6-digit verification code.");
    }

    user = await User.findOneAndUpdate(
      {
        email,
        emailVerified: false,
        emailVerificationTokenHash: hashEmailVerificationCode(email, code),
        emailVerificationExpiresAt: { $gt: now },
        emailVerificationAttempts: { $lt: maxVerificationCodeAttempts },
      },
      {
        $set: { emailVerified: true, emailVerificationRequired: false },
        $unset: {
          emailVerificationTokenHash: "",
          emailVerificationExpiresAt: "",
          emailVerificationAttempts: "",
        },
      },
      { new: true },
    );

    if (!user) {
      const pendingUser = await User.findOne({
        email,
        emailVerified: false,
      }).select("+emailVerificationExpiresAt +emailVerificationAttempts");
      if (pendingUser?.emailVerificationExpiresAt <= now) {
        throw badRequest("This verification code has expired. Request a new code and try again.");
      }
      if ((pendingUser?.emailVerificationAttempts ?? 0) >= maxVerificationCodeAttempts) {
        throw badRequest("Too many incorrect codes. Request a new verification code.");
      }
      if (pendingUser) {
        await User.updateOne(
          {
            _id: pendingUser._id,
            emailVerified: false,
            emailVerificationAttempts: { $lt: maxVerificationCodeAttempts },
          },
          { $inc: { emailVerificationAttempts: 1 } },
        );
      }
      throw badRequest("The verification code is invalid or has expired.");
    }
  }

  if (token && !user) {
    const expiredUser = await User.findOne({
      emailVerificationTokenHash: tokenHash,
    }).select("+emailVerificationExpiresAt");

    if (expiredUser?.emailVerificationExpiresAt <= now) {
      throw badRequest(
        "This verification link has expired. Request a new verification code and try again.",
      );
    }

    throw badRequest("This verification link is invalid or has already been used.");
  }

  user = await reloadVerifiedAuthUser(user);

  response.clearCookie(authCookieName, {
    ...getClearCookieOptions(),
    path: legacyAuthCookiePath,
  });
  response.cookie(authCookieName, signAuthToken(user), getAuthCookieOptions());
  response.json({
    status: "success",
    message: "Email verified. You are now signed in.",
    user: typeof user.toSafeObject === "function" ? user.toSafeObject() : user,
  });
}

async function restoreVerificationToken(
  user,
  tokenHash,
  previousTokenHash,
  previousExpiresAt,
  previousAttempts,
) {
  const update = { $set: {}, $unset: {} };

  if (previousTokenHash) {
    update.$set.emailVerificationTokenHash = previousTokenHash;
  } else {
    update.$unset.emailVerificationTokenHash = "";
  }

  if (previousExpiresAt) {
    update.$set.emailVerificationExpiresAt = previousExpiresAt;
  } else {
    update.$unset.emailVerificationExpiresAt = "";
  }

  if (previousAttempts) {
    update.$set.emailVerificationAttempts = previousAttempts;
  } else {
    update.$unset.emailVerificationAttempts = "";
  }

  if (Object.keys(update.$set).length === 0) delete update.$set;
  if (Object.keys(update.$unset).length === 0) delete update.$unset;

  await User.updateOne(
    { _id: user._id, emailVerificationTokenHash: tokenHash },
    update,
  );
}

export async function resendVerificationEmail(request, response, dependencies = {}) {
  const email = normalizeEmail(request.body?.email);
  if (!email) {
    throw badRequest("Email is required.");
  }

  const user = await User.findOne({ email }).select(
    "+emailVerificationTokenHash +emailVerificationExpiresAt +emailVerificationAttempts",
  );

  if (user && !user.emailVerified) {
    const verificationCode = createEmailVerificationCode();
    const tokenHash = hashEmailVerificationCode(email, verificationCode);
    const previousTokenHash = user.emailVerificationTokenHash;
    const previousExpiresAt = user.emailVerificationExpiresAt;
    const previousAttempts = user.emailVerificationAttempts;

    user.emailVerificationTokenHash = tokenHash;
    user.emailVerificationExpiresAt = new Date(Date.now() + verificationCodeLifetimeMs);
    user.emailVerificationAttempts = 0;
    await user.save();

    try {
      await deliverVerificationCode(user, verificationCode, dependencies.sendEmail);
    } catch (deliveryError) {
      try {
        await restoreVerificationToken(
          user,
          tokenHash,
          previousTokenHash,
          previousExpiresAt,
          previousAttempts,
        );
      } catch (restoreError) {
        throw new AggregateError(
          [deliveryError, restoreError],
          "Verification email delivery failed and the previous token could not be restored.",
        );
      }
      throw deliveryError;
    }
  }

  response.json({
    status: "success",
    message: "If an unverified account exists for that email, a verification code has been sent.",
  });
}

export async function forgotPassword(request, response) {
  const email = normalizeEmail(request.body?.email);
  if (!email) {
    throw badRequest("Email is required.");
  }

  const user = await User.findOne({ email: escapedExact(email) });
  if (user) {
    const token = createActionToken();
    user.passwordResetTokenHash = hashActionToken(token);
    user.passwordResetExpiresAt = new Date(Date.now() + actionTokenLifetimeMs);
    await user.save();

    const resetUrl = createActionUrl("/reset-password", token);
    await sendActionEmail({
      to: user.email,
      subject: "Reset your StudyShare password",
      text: `Hi ${user.fullName},\n\nReset your password using this link:\n${resetUrl}\n\nThis link expires in one hour. If you did not request this, you can ignore this email.`,
    });
  }

  response.json({
    status: "success",
    message: "If an account exists for that email, password reset instructions have been sent.",
  });
}

export async function resetPassword(request, response) {
  const { token, password } = request.body ?? {};
  requireActionToken(token);
  if (!validatePassword(password)) {
    throw badRequest("Password must be at least 8 characters and no more than 72 UTF-8 bytes.");
  }

  const user = await User.findOne({
    passwordResetTokenHash: hashActionToken(token),
    passwordResetExpiresAt: { $gt: new Date() },
  }).select("+passwordResetTokenHash +passwordResetExpiresAt +authVersion");

  if (!user) {
    throw badRequest("This reset link is invalid or has expired.");
  }

  user.password = password;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.authVersion += 1;
  await user.save();

  response.json({
    status: "success",
    message: "Password reset successfully. Please sign in with your new password.",
  });
}
