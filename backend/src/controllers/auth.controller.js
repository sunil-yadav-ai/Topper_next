import User from "../models/User.js";
import { sendActionEmail } from "../services/email.service.js";
import {
  authCookieName,
  createActionToken,
  createActionUrl,
  getAuthCookieOptions,
  getClearCookieOptions,
  hashActionToken,
  legacyAuthCookiePath,
  signAuthToken,
  validatePassword,
} from "../services/auth.service.js";
import { createUniqueUsername } from "../services/username.service.js";

const actionTokenLifetimeMs = 60 * 60 * 1000;

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

async function deliverVerificationEmail(user, token) {
  const verificationUrl = createActionUrl("/verify-email", token);
  await sendActionEmail({
    to: user.email,
    subject: "Verify your StudyShare email",
    text: `Hi ${user.fullName},\n\nVerify your email address to activate your account:\n${verificationUrl}\n\nThis link expires in one hour.`,
  });
}

export async function registerStudent(request, response) {
  const {
    fullName,
    email,
    password,
    college,
    university,
    department,
    batch,
    semester,
  } = request.body ?? {};

  if (
    !isNonEmptyString(fullName) ||
    !isNonEmptyString(college) ||
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
  if (!validatePassword(password)) {
    throw badRequest("Password must be at least 8 characters and no more than 72 UTF-8 bytes.");
  }

  const username = await createUniqueUsername(User, fullName);
  await User.create({
    fullName,
    email: normalizeEmail(email),
    username,
    password,
    college,
    university,
    department,
    batch,
    semester: Number(semester),
    role: "user",
  });

  response.status(201).json({
    status: "success",
    message: "Account created successfully. You can sign in now.",
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
  }).select("+password +authVersion");
  if (!user || !(await user.comparePassword(password))) {
    throw unauthorized();
  }
  if (requiredRole && user.role !== requiredRole) {
    throw unauthorized();
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

export async function verifyEmail(request, response) {
  const { token } = request.body ?? {};
  requireActionToken(token);

  const tokenHash = hashActionToken(token);
  const now = new Date();
  const user = await User.findOneAndUpdate(
    {
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpiresAt: { $gt: now },
    },
    {
      $set: { emailVerified: true },
      $unset: {
        emailVerificationTokenHash: "",
        emailVerificationExpiresAt: "",
      },
    },
    { new: true },
  );

  if (!user) {
    const expiredUser = await User.findOne({
      emailVerificationTokenHash: tokenHash,
    }).select("+emailVerificationExpiresAt");

    if (expiredUser?.emailVerificationExpiresAt <= now) {
      throw badRequest(
        "This verification link has expired. Request a new verification email and try again.",
      );
    }

    throw badRequest("This verification link is invalid or has already been used.");
  }

  response.json({
    status: "success",
    message: "Email verified. You can now sign in.",
  });
}

async function restoreVerificationToken(user, tokenHash, previousTokenHash, previousExpiresAt) {
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

  if (Object.keys(update.$set).length === 0) delete update.$set;
  if (Object.keys(update.$unset).length === 0) delete update.$unset;

  await User.updateOne(
    { _id: user._id, emailVerificationTokenHash: tokenHash },
    update,
  );
}

export async function resendVerificationEmail(request, response) {
  const email = normalizeEmail(request.body?.email);
  if (!email) {
    throw badRequest("Email is required.");
  }

  const user = await User.findOne({ email }).select(
    "+emailVerificationTokenHash +emailVerificationExpiresAt",
  );

  if (user && !user.emailVerified) {
    const token = createActionToken();
    const tokenHash = hashActionToken(token);
    const previousTokenHash = user.emailVerificationTokenHash;
    const previousExpiresAt = user.emailVerificationExpiresAt;

    user.emailVerificationTokenHash = tokenHash;
    user.emailVerificationExpiresAt = new Date(Date.now() + actionTokenLifetimeMs);
    await user.save();

    try {
      await deliverVerificationEmail(user, token);
    } catch (deliveryError) {
      try {
        await restoreVerificationToken(
          user,
          tokenHash,
          previousTokenHash,
          previousExpiresAt,
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
    message: "If an unverified account exists for that email, a verification link has been sent.",
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
