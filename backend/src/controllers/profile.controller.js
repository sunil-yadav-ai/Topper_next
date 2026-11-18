import mongoose from "mongoose";
import Note from "../models/Note.js";
import Pyq from "../models/Pyq.js";
import User from "../models/User.js";
import {
  normalizeUsername,
  usernamePattern,
} from "../services/username.service.js";
import {
  deleteProfileImage,
  deleteProfilePhoto,
  uploadProfileCover,
  uploadProfilePhoto,
} from "../services/profile-photo.service.js";

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

function publicNote(note) {
  return {
    id: note._id.toString(),
    type: "note",
    title: note.title,
    subject: note.subject,
    semester: note.semester,
    createdAt: note.createdAt,
    viewPath: `/search/resources/note/${note._id}/view`,
  };
}

function publicPyq(pyq) {
  return {
    id: pyq._id.toString(),
    type: "pyq",
    title: `${pyq.subject} - ${pyq.examinationYear} ${pyq.examType}`,
    subject: pyq.subject,
    semester: pyq.semester,
    createdAt: pyq.createdAt,
    viewPath: `/search/resources/pyq/${pyq._id}/view`,
  };
}

function publicProfile(user) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    username: user.username,
    bio: user.bio ?? "",
    college: user.college,
    university: user.university,
    course: user.course ?? "",
    department: user.department,
    avatarUrl: user.avatarUrl ?? "",
    coverImage: user.coverImage ?? "",
    joinedAt: user.createdAt,
    role: user.role,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function publicProfileSearchResult(user) {
  return {
    id: user._id.toString(),
    fullName: user.fullName,
    username: user.username,
    avatarUrl: user.avatarUrl ?? "",
  };
}

export async function searchPublicProfiles(request, response) {
  const rawQuery = request.query?.q;
  if (rawQuery === undefined || rawQuery === "") {
    response.json({ status: "success", users: [] });
    return;
  }
  if (typeof rawQuery !== "string") {
    throw badRequest("Search query must be a string.");
  }

  const query = rawQuery.trim().replace(/^@/, "");
  if (query.length > 50) {
    throw badRequest("Search query must be at most 50 characters.");
  }
  if (query.length < 2) {
    response.json({ status: "success", users: [] });
    return;
  }

  const pattern = new RegExp(escapeRegex(query), "i");
  const users = await User.find({
    $or: [{ fullName: pattern }, { username: pattern }],
  })
    .select("fullName username avatarUrl")
    .sort({ fullName: 1 })
    .limit(20)
    .lean();

  response.json({
    status: "success",
    users: users.map(publicProfileSearchResult),
  });
}

export async function getPublicProfile(request, response) {
  const username = normalizeUsername(request.params.username);
  const validUsername = usernamePattern.test(username);
  const validUserId = mongoose.isValidObjectId(username);
  if (!validUsername && !validUserId) {
    throw badRequest("Username is invalid.");
  }

  const profileFields =
    "fullName username bio college university course department avatarUrl coverImage createdAt role";
  let user = validUsername
    ? await User.findOne({ username }).select(profileFields)
    : null;
  if (!user && validUserId) {
    user = await User.findById(username).select(profileFields);
  }
  if (!user) {
    const error = new Error("Profile not found.");
    error.statusCode = 404;
    throw error;
  }

  const noteFilter = {
    uploadedBy: user._id,
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  };
  const pyqFilter = {
    uploadedBy: user._id,
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  };
  const [notes, pyqs, totalNotes, totalPyqs] = await Promise.all([
    Note.find(noteFilter).select("_id title subject semester createdAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    Pyq.find(pyqFilter).select("_id subject examinationYear examType semester createdAt")
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    Note.countDocuments(noteFilter),
    Pyq.countDocuments(pyqFilter),
  ]);
  const contributions = [...notes.map(publicNote), ...pyqs.map(publicPyq)]
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));

  response.json({
    status: "success",
    profile: publicProfile(user),
    stats: {
      totalUploadedNotes: totalNotes,
      totalUploadedPyqs: totalPyqs,
      totalContributions: totalNotes + totalPyqs,
    },
    contributions,
  });
}

export async function updateOwnProfile(request, response) {
  const { removeAvatar, ...updates } = request.body ?? {};
  const avatarFile = request.file ?? request.files?.avatar?.[0];
  const coverFile = request.files?.cover?.[0];
  const allowedFields = ["fullName", "username", "bio", "college", "course"];
  const requestedFields = Object.keys(updates);
  if (
    (removeAvatar !== undefined && removeAvatar !== "true" && removeAvatar !== "false") ||
    requestedFields.some((field) => !allowedFields.includes(field)) ||
    (requestedFields.length === 0 && !avatarFile && !coverFile && removeAvatar !== "true")
  ) {
    throw badRequest("Only name, username, bio, college, course, and profile photo may be updated.");
  }

  const user = await User.findById(request.user._id)
    .select("+avatarPublicId +coverImagePublicId");
  if (!user) {
    const error = new Error("Profile not found.");
    error.statusCode = 404;
    throw error;
  }

  for (const field of requestedFields) {
    const value = updates[field];
    if (typeof value !== "string") {
      throw badRequest(`${field} must be a string.`);
    }
    const normalized = value.trim();
    if (field !== "bio" && field !== "course" && !normalized) {
      throw badRequest(`${field} cannot be empty.`);
    }
    if (field === "fullName" && (normalized.length < 2 || normalized.length > 100)) {
      throw badRequest("Name must be between 2 and 100 characters.");
    }
    if (field === "college" && normalized.length > 120) {
      throw badRequest("College must be at most 120 characters.");
    }
    if (field === "course" && normalized.length > 120) {
      throw badRequest("Course must be at most 120 characters.");
    }
    if (field === "bio" && normalized.length > 300) {
      throw badRequest("Bio must be at most 300 characters.");
    }
    if (field === "username") {
      const username = normalizeUsername(normalized);
      if (!usernamePattern.test(username)) {
        throw badRequest("Username must be 3–30 characters using letters, numbers, dots, or underscores.");
      }
      const existing = await User.exists({
        username,
        _id: { $ne: user._id },
      });
      if (existing) throw conflict("That username is already taken.");
      user.username = username;
      continue;
    }
    user[field] = normalized;
  }

  const oldAvatarPublicId = user.avatarPublicId;
  const oldCoverPublicId = user.coverImagePublicId;
  let uploadedAvatar;
  let uploadedCover;
  try {
    if (avatarFile) {
      uploadedAvatar = await uploadProfilePhoto(avatarFile);
      user.avatarUrl = uploadedAvatar.url;
      user.avatarPublicId = uploadedAvatar.publicId;
    } else if (removeAvatar === "true") {
      user.avatarUrl = "";
      user.avatarPublicId = undefined;
    }

    if (coverFile) {
      uploadedCover = await uploadProfileCover(coverFile);
      user.coverImage = uploadedCover.url;
      user.coverImagePublicId = uploadedCover.publicId;
    }

    await user.save();
  } catch (error) {
    for (const uploadedImage of [uploadedAvatar, uploadedCover].filter(Boolean)) {
      try {
        await deleteProfileImage(uploadedImage.publicId);
      } catch (cleanupError) {
        console.error("Could not clean up an incomplete profile image upload.", cleanupError.code ?? "UNKNOWN");
      }
    }
    if (error?.code === 11000 && error.keyPattern?.username) {
      throw conflict("That username is already taken.");
    }
    throw error;
  }

  if (oldAvatarPublicId && oldAvatarPublicId !== user.avatarPublicId) {
    try {
      await deleteProfilePhoto(oldAvatarPublicId);
    } catch (error) {
      console.error("Could not remove the previous profile photo.", error.code ?? "UNKNOWN");
    }
  }
  if (oldCoverPublicId && oldCoverPublicId !== user.coverImagePublicId) {
    try {
      await deleteProfileImage(oldCoverPublicId);
    } catch (error) {
      console.error("Could not remove the previous profile cover.", error.code ?? "UNKNOWN");
    }
  }
  response.json({ status: "success", profile: user.toSafeObject() });
}
