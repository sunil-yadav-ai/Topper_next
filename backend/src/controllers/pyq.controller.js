import { basename } from "node:path";
import mongoose from "mongoose";
import Pyq from "../models/Pyq.js";
import PyqReport from "../models/PyqReport.js";
import Bookmark from "../models/Bookmark.js";
import User from "../models/User.js";
import {
  deletePyqFile,
  uploadPyqFile,
} from "../services/pyq-storage.service.js";
import {
  parsePyqMetadata,
  validatePyqFile,
} from "../services/pyq-validation.service.js";
import {
  getStudentLibrary,
  migrateLegacyPyqBookmarks,
  removeLibraryBookmarkByResource,
  saveLibraryBookmark,
} from "../services/student-library.service.js";
import { sendResourceUploadEmail } from "../services/email-notification.service.js";
import { awardContribution } from "../services/reward.service.js";

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function requiredText(body, field, maxLength) {
  const value = typeof body[field] === "string" ? body[field].trim() : "";
  if (!value || value.length > maxLength) {
    throw badRequest(`${field} is required and must be at most ${maxLength} characters.`);
  }
  return value;
}

function serializePyq(pyq, savedIds = new Set()) {
  return {
    id: pyq._id.toString(),
    university: pyq.university,
    college: pyq.college,
    department: pyq.department,
    course: pyq.course,
    semester: pyq.semester,
    subject: pyq.subject,
    title: pyq.title || `${pyq.subject} - ${pyq.examinationYear} ${pyq.examType}`,
    description: pyq.description || `${pyq.course} · ${pyq.department}`,
    examinationYear: pyq.examinationYear,
    examType: pyq.examType,
    fileName: pyq.fileName,
    fileFormat: pyq.storage.format ?? "pdf",
    fileSize: pyq.storage.bytes,
    downloadCount: pyq.downloadCount,
    reportCount: pyq.reportCount,
    helpfulCount: pyq.helpfulCount ?? 0,
    publicationStatus: pyq.publicationStatus ?? "published",
    visibility: pyq.visibility ?? "public",
    uploadedBy: pyq.uploadedBy?.fullName ?? "Student",
    uploadedByUsername: pyq.uploadedBy?.username ?? null,
    uploadedByAvatarUrl: pyq.uploadedBy?.avatarUrl ?? "",
    isBookmarked: savedIds.has(pyq._id.toString()),
    createdAt: pyq.createdAt,
    viewPath: `/search/resources/pyq/${pyq._id}/view`,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function browsePyqs(request, response) {
  const page = Number(request.query.page ?? 1);
  const limit = Number(request.query.limit ?? 12);
  if (!Number.isInteger(page) || page < 1 || page > 10000) {
    throw badRequest("Page must be a positive whole number.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw badRequest("Limit must be a whole number between 1 and 50.");
  }

  const filter = {
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  };
  for (const [parameter, field, min, max] of [
    ["semester", "semester", 1, 12],
    ["examinationYear", "examinationYear", 1900, new Date().getFullYear() + 1],
  ]) {
    if (request.query[parameter] !== undefined && request.query[parameter] !== "") {
      const value = Number(request.query[parameter]);
      if (!Number.isInteger(value) || value < min || value > max) {
        throw badRequest(`${parameter} is outside the supported range.`);
      }
      filter[field] = value;
    }
  }

  for (const field of ["subject", "university", "college", "department", "course", "examType"]) {
    const value = request.query[field];
    if (typeof value === "string" && value.trim()) {
      filter[field] = { $regex: escapeRegex(value.trim()), $options: "i" };
    }
  }

  const search = typeof request.query.search === "string"
    ? request.query.search.trim().slice(0, 100)
    : "";
  if (search) {
    const expression = { $regex: escapeRegex(search), $options: "i" };
    filter.$or = [
      { university: expression },
      { college: expression },
      { department: expression },
      { course: expression },
      { subject: expression },
      { examType: expression },
      { fileName: expression },
    ];
  }

  if (request.user?.role === "user") {
    await migrateLegacyPyqBookmarks(request.user._id);
  }
  const [pyqs, total, bookmarks] = await Promise.all([
    Pyq.find(filter)
      .populate("uploadedBy", "fullName username avatarUrl")
      .sort({ examinationYear: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Pyq.countDocuments(filter),
    request.user
      ? Bookmark.find({ user: request.user._id, resourceType: "pyq" })
          .select("resource")
          .lean()
      : null,
  ]);
  const savedIds = new Set((bookmarks ?? []).map((bookmark) => bookmark.resource.toString()));

  response.json({
    status: "success",
    pyqs: pyqs.map((pyq) => serializePyq(pyq, savedIds)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

export async function getMyUploadedPyqs(request, response) {
  const pyqs = await Pyq.find({ uploadedBy: request.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  response.json({
    status: "success",
    pyqs: pyqs.map((pyq) => ({
      ...serializePyq(pyq),
    })),
  });
}

export async function uploadPyq(request, response) {
  validatePyqFile(request.file);
  const fields = parsePyqMetadata(request.body, request.user);
  const storage = await uploadPyqFile(request.file);
  let pyq;
  try {
    pyq = await Pyq.create({
      ...fields,
      title: fields.title ?? `${fields.subject} - ${fields.examinationYear} ${fields.examType}`,
      description: fields.description ?? `${fields.course} · ${fields.department}`,
      fileName: basename(request.file.originalname),
      storage,
      uploadedBy: request.user._id,
    });
  } catch (error) {
    try {
      await deletePyqFile(storage);
    } catch (cleanupError) {
      console.error("Failed to clean up an incomplete PYQ upload.", cleanupError);
    }
    throw error;
  }

  try {
    await awardContribution({
      userId: request.user._id,
      actorId: request.user._id,
      type: "pyq",
      sourceType: "pyq",
      sourceId: pyq._id,
      title: `${pyq.subject} ${pyq.examinationYear} PYQ`,
      reason: "Question paper was automatically published after a successful upload.",
    });
  } catch (error) {
    console.error(`Could not award points for PYQ ${pyq._id}:`, error);
  }

  await sendResourceUploadEmail({
    Model: Pyq,
    resourceId: pyq._id.toString(),
    recipientEmail: request.user.email,
    studentName: request.user.fullName,
    resourceName: `${pyq.subject} - ${pyq.examinationYear} ${pyq.examType} question paper`,
    category: "Previous year question paper",
    status: "Successfully uploaded and published",
    uploadedAt: pyq.createdAt,
  });

  response.status(201).json({
    status: "success",
    message: "Question paper is now public in Explore.",
    pyq: serializePyq(pyq),
  });
}

export async function getMyBookmarks(request, response) {
  const result = await getStudentLibrary(request.user._id, "saved");
  response.json({
    status: "success",
    pyqs: result.items
      .filter((item) => item.type === "pyq")
      .map((item) => ({
        ...item,
        isBookmarked: true,
        fileName: item.title,
        fileSize: 0,
        downloadCount: item.downloadCount ?? 0,
        reportCount: 0,
        uploadedBy: "Student",
      })),
  });
}

export async function bookmarkPyq(request, response) {
  if (!mongoose.isValidObjectId(request.params.pyqId)) {
    throw badRequest("Question paper ID is invalid.");
  }
  const pyq = await Pyq.findOne({
    _id: request.params.pyqId,
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  }).select("_id");
  if (!pyq) {
    const error = new Error("Question paper not found.");
    error.statusCode = 404;
    throw error;
  }
  await saveLibraryBookmark({
    userId: request.user._id,
    resourceType: "pyq",
    resourceId: pyq._id,
  });
  response.json({ status: "success", message: "Question paper bookmarked." });
}

export async function removePyqBookmark(request, response) {
  if (!mongoose.isValidObjectId(request.params.pyqId)) {
    throw badRequest("Question paper ID is invalid.");
  }
  await removeLibraryBookmarkByResource({
    userId: request.user._id,
    resourceType: "pyq",
    resourceId: request.params.pyqId,
  });
  await User.updateOne(
    { _id: request.user._id },
    { $pull: { savedPyqs: request.params.pyqId } },
  );
  response.json({ status: "success", message: "Bookmark removed." });
}

export async function reportPyq(request, response) {
  if (!mongoose.isValidObjectId(request.params.pyqId)) {
    throw badRequest("Question paper ID is invalid.");
  }
  const pyq = await Pyq.findOne({
    _id: request.params.pyqId,
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  }).select("_id");
  if (!pyq) {
    const error = new Error("Question paper not found.");
    error.statusCode = 404;
    throw error;
  }
  const reason = request.body.reason;
  if (!["incorrect", "duplicate", "other"].includes(reason)) {
    throw badRequest("Choose incorrect, duplicate, or other as the report reason.");
  }
  const details =
    typeof request.body.details === "string" ? request.body.details.trim() : "";
  if (details.length > 1000) throw badRequest("Report details must be 1000 characters or fewer.");

  try {
    await PyqReport.create({
      pyq: pyq._id,
      reportedBy: request.user._id,
      reason,
      details,
    });
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 409;
      error.message = "You have already reported this question paper.";
    }
    throw error;
  }
  await Pyq.updateOne({ _id: pyq._id }, { $inc: { reportCount: 1 } });
  response.status(201).json({
    status: "success",
    message: "Thank you. Your report was sent for review.",
  });
}
