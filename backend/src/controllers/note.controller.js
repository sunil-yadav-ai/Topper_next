import { basename } from "node:path";
import mongoose from "mongoose";
import Note from "../models/Note.js";
import NoteOcrJob from "../models/NoteOcrJob.js";
import NoteOcrResult from "../models/NoteOcrResult.js";
import NoteVerificationHistory from "../models/NoteVerificationHistory.js";
import NoteVerificationJob from "../models/NoteVerificationJob.js";
import NoteVerificationResult from "../models/NoteVerificationResult.js";
import Notification from "../models/Notification.js";
import Bookmark from "../models/Bookmark.js";
import StudentResourceAccess from "../models/StudentResourceAccess.js";
import { removeCommunityReportNotifications } from "./note-community.controller.js";
import {
  deleteNoteFile,
  deleteNotePreview,
  uploadNoteFile,
  uploadNotePreview,
  validateNoteFile,
} from "../services/note-storage.service.js";
import { renderPdfFirstPagePreview } from "../services/note-preview.service.js";
import { decryptOcrResult } from "../services/note-ocr.service.js";
import { decryptJson } from "../services/encrypted-json.service.js";
import { createNotification } from "../services/notification.service.js";
import { sendResourceUploadEmail } from "../services/email-notification.service.js";
import { assertNoteSubjectRelevance } from "../services/note-relevance.service.js";

function requiredText(body, field, maxLength) {
  const value = typeof body[field] === "string" ? body[field].trim() : "";
  if (!value || value.length > maxLength) {
    const error = new Error(`${field} is required and must be at most ${maxLength} characters.`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function optionalText(body, field, maxLength) {
  const value = typeof body[field] === "string" ? body[field].trim() : "";
  if (value.length > maxLength) {
    const error = new Error(`${field} must be at most ${maxLength} characters.`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function serializeNote(note, request) {
  const noteId = note._id.toString();
  const uploader = note.uploadedBy;
  return {
    id: noteId,
    title: note.title,
    description: note.description,
    department: note.department,
    batch: note.batch,
    semester: note.semester,
    subject: note.subject,
    university: note.university ?? "",
    marks: note.marks ?? null,
    unit: note.unit,
    topic: note.topic,
    fileName: note.fileName,
    fileFormat: note.storage.format,
    fileSize: note.storage.bytes,
    verificationStatus:
      note.verificationStatus ??
      (note.ocrStatus === "completed" ? "completed" : "queued"),
    verificationError: note.verificationError ?? null,
    approvalDecision:
      note.approvalDecision ??
      (note.verificationStatus === "completed"
        ? "NEEDS_HUMAN_REVIEW"
        : "PENDING"),
    decisionSource: note.decisionSource ?? "ai",
    moderationReason: note.moderationReason ?? "",
    verifiableStatementCount: note.verifiableStatementCount ?? 0,
    confirmedErrorCount: note.confirmedErrorCount ?? 0,
    mistakePercentage: note.mistakePercentage ?? null,
    humanReviewReason: note.humanReviewReason ?? "",
    publicationStatus: note.publicationStatus ?? "private",
    visibility: note.visibility ?? "private",
    ocrStatus: note.ocrStatus ?? "queued",
    ocrPageCount: note.ocrPageCount ?? null,
    ocrError: note.ocrError ?? null,
    revisionNumber: note.revisionNumber ?? 1,
    revisionOf: note.revisionOf?.toString() ?? null,
    uploadedBy: uploader?.username
      ? {
          id: uploader._id.toString(),
          fullName: uploader.fullName,
          username: uploader.username,
          avatarUrl: uploader.avatarUrl ?? "",
        }
      : null,
    createdAt: note.createdAt,
    viewPath: `/search/resources/note/${noteId}/view`,
  };
}

export async function createNote(request, response) {
  if (!request.file) {
    const error = new Error("Choose a note file to upload.");
    error.statusCode = 400;
    throw error;
  }

  const fileInfo = validateNoteFile(request.file);
  const marks = request.body.marks === undefined || request.body.marks === ""
    ? undefined
    : Number(request.body.marks);
  if (
    marks !== undefined &&
    (!Number.isInteger(marks) || marks < 1 || marks > 100000)
  ) {
    const error = new Error("Marks must be a whole number between 1 and 100000.");
    error.statusCode = 400;
    throw error;
  }
  const semester = request.body.semester === undefined || request.body.semester === ""
    ? request.user.semester
    : Number(request.body.semester);
  if (!Number.isInteger(semester) || semester < 1 || semester > 12) {
    const error = new Error("Semester must be a whole number between 1 and 12.");
    error.statusCode = 400;
    throw error;
  }

  const fields = {
    title: requiredText(request.body, "title", 200),
    description: requiredText(request.body, "description", 2000),
    department: request.body.department
      ? requiredText(request.body, "department", 120)
      : request.user.department,
    batch: request.body.batch
      ? requiredText(request.body, "batch", 30)
      : request.user.batch,
    semester,
    subject: requiredText(request.body, "subject", 120),
    university: request.body.university
      ? requiredText(request.body, "university", 160)
      : request.user.university,
    marks,
    unit: optionalText(request.body, "unit", 80),
    topic: optionalText(request.body, "topic", 160),
  };

  const relevancePercentage = await assertNoteSubjectRelevance({
    fields,
    file: request.file,
    userId: request.user._id,
  });
  const note = await createNoteSubmission({
    fields,
    file: request.file,
    format: fileInfo.format,
    uploadedBy: request.user._id,
    uploader: request.user,
  });

  response.status(201).json({
    status: "success",
    message: `Your note passed the ${relevancePercentage}% subject relevance check and is now public in Explore. OCR and AI verification are continuing in the background.`,
    note: serializeNote(note, request),
  });
}

async function createNoteSubmission({
  fields,
  file,
  format,
  uploadedBy,
  uploader,
  revisionOf = null,
  revisionRoot = null,
  revisionNumber = 1,
}) {
  const id = new mongoose.Types.ObjectId();
  let storedFile;
  let previewStorage;
  let note;
  try {
    storedFile = await uploadNoteFile(file, format);
    if (format === "pdf") {
      try {
        previewStorage = await uploadNotePreview(
          await renderPdfFirstPagePreview(file.buffer),
        );
      } catch (previewError) {
        console.error(`Could not generate preview for note ${id}.`, previewError);
      }
    }
    note = await Note.create({
      _id: id,
      ...fields,
      uploadedBy,
      storage: storedFile,
      previewStorage,
      fileName: basename(file.originalname),
      revisionRoot: revisionRoot ?? id,
      revisionOf,
      revisionNumber,
      approvalDecision: "PENDING",
      publicationStatus: "published",
      visibility: "public",
    });
    await createNotification({
      recipient: uploadedBy,
      type: "note_uploaded",
      title: revisionOf ? "Corrected notes uploaded" : "Notes upload complete",
      message: revisionOf
        ? `"${note.title}" was uploaded as a corrected version and is queued for OCR and AI verification.`
        : `"${note.title}" was uploaded and is queued for OCR and AI verification.`,
      link: "/library",
      dedupeKey: `note-uploaded:${note._id}`,
    });
    await NoteOcrJob.create({ note: note._id });
    await NoteVerificationJob.create({ note: note._id });
  } catch (error) {
    if (note) {
      await Promise.all([
        Notification.deleteOne({ dedupeKey: `note-uploaded:${note._id}` }),
        NoteOcrJob.deleteOne({ note: note._id }),
        NoteVerificationJob.deleteOne({ note: note._id }),
        Note.deleteOne({ _id: note._id }),
      ]);
    }
    if (storedFile) {
      try {
        await deleteNoteFile(storedFile);
      } catch (cleanupError) {
        console.error("Failed to clean up an incomplete note upload.", cleanupError);
      }
    }
    if (previewStorage) {
      try {
        await deleteNotePreview(previewStorage);
      } catch (cleanupError) {
        console.error("Failed to clean up an incomplete note preview.", cleanupError);
      }
    }
    throw error;
  }

  await sendResourceUploadEmail({
    Model: Note,
    resourceId: note._id.toString(),
    recipientEmail: uploader.email,
    studentName: uploader.fullName,
    resourceName: note.title,
    category: "Handwritten notes and study materials",
    status: "Successfully uploaded; queued for verification",
    uploadedAt: note.createdAt,
  });

  return note;
}

export async function resubmitCorrectedNote(request, response) {
  if (!request.file) {
    const error = new Error("Choose the corrected note file to upload.");
    error.statusCode = 400;
    throw error;
  }
  const parent = await Note.findOne({
    _id: request.params.noteId,
    uploadedBy: request.user._id,
  });
  if (!parent) {
    const error = new Error("Note not found.");
    error.statusCode = 404;
    throw error;
  }
  const rootId = parent.revisionRoot ?? parent._id;
  const latest = await Note.findOne({
    $or: [{ revisionRoot: rootId }, { _id: rootId }],
    uploadedBy: request.user._id,
  })
    .sort({ revisionNumber: -1 })
    .select("_id revisionNumber");
  if (latest && !latest._id.equals(parent._id)) {
    const error = new Error("Resubmit the latest version of this note.");
    error.statusCode = 409;
    throw error;
  }

  const fileInfo = validateNoteFile(request.file);
  const fields = {
    title: parent.title,
    description: parent.description,
    department: parent.department,
    batch: parent.batch,
    semester: parent.semester,
    subject: parent.subject,
    university: parent.university ?? "",
    marks: parent.marks,
    unit: parent.unit,
    topic: parent.topic,
  };
  const relevancePercentage = await assertNoteSubjectRelevance({
    fields,
    file: request.file,
    userId: request.user._id,
  });
  const note = await createNoteSubmission({
    fields,
    file: request.file,
    format: fileInfo.format,
    uploadedBy: request.user._id,
    uploader: request.user,
    revisionOf: parent._id,
    revisionRoot: rootId,
    revisionNumber: (latest?.revisionNumber ?? parent.revisionNumber ?? 1) + 1,
  });

  response.status(201).json({
    status: "success",
    message: `Your corrected version passed the ${relevancePercentage}% subject relevance check and was uploaded for OCR and AI verification.`,
    note: serializeNote(note, request),
  });
}

export async function getMyNotes(request, response) {
  const notes = await Note.find({ uploadedBy: request.user._id })
    .sort({ createdAt: -1 })
    .lean();

  response.json({
    status: "success",
    notes: notes.map((note) => serializeNote(note, request)),
  });
}

export async function getPublishedNotes(request, response) {
  const filter = {
    department: {
      $regex: `^${escapeRegex(request.user.department)}$`,
      $options: "i",
    },
    publicationStatus: "published",
    visibility: { $in: ["public", null] },
  };
  if (typeof request.query.subject === "string" && request.query.subject.trim()) {
    const subject = request.query.subject.trim();
    if (subject.length > 120) {
      const error = new Error("Subject must be at most 120 characters.");
      error.statusCode = 400;
      throw error;
    }
    filter.subject = { $regex: `^${escapeRegex(subject)}$`, $options: "i" };
  }

  if (request.query.subjectsOnly === "true") {
    const subjects = await Note.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { subject: "$subject", semester: "$semester" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.subject": 1, "_id.semester": 1 } },
    ]);
    const subjectStats = {};
    for (const { _id, count } of subjects) {
      subjectStats[_id.subject] ??= { count: 0, semesters: [] };
      subjectStats[_id.subject].count += count;
      subjectStats[_id.subject].semesters.push(_id.semester);
    }
    response.json({
      status: "success",
      subjects: Object.keys(subjectStats),
      subjectStats,
    });
    return;
  }

  const page = Number(request.query.page ?? 1);
  const limit = Number(request.query.limit ?? 100);
  if (!Number.isInteger(page) || page < 1 || page > 10000) {
    const error = new Error("Page must be a positive whole number.");
    error.statusCode = 400;
    throw error;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    const error = new Error("Limit must be a whole number between 1 and 100.");
    error.statusCode = 400;
    throw error;
  }

  const [notes, total] = await Promise.all([
    Note.find(filter)
      .populate("uploadedBy", "fullName username avatarUrl")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Note.countDocuments(filter),
  ]);
  response.json({
    status: "success",
    notes: notes.map((note) => serializeNote(note, request)),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getMyNoteOcr(request, response) {
  const note = await Note.findOne({
    _id: request.params.noteId,
    uploadedBy: request.user._id,
  }).select("ocrStatus ocrPageCount ocrError");
  if (!note) {
    const error = new Error("Note not found.");
    error.statusCode = 404;
    throw error;
  }

  if (note.ocrStatus !== "completed") {
    response.json({
      status: "success",
      ocrStatus: note.ocrStatus,
      pageCount: note.ocrPageCount ?? null,
      error: note.ocrError ?? null,
      pages: [],
    });
    return;
  }

  const storedResult = await NoteOcrResult.findOne({ note: note._id })
    .select("+encryptedResult")
    .lean();
  if (!storedResult) {
    throw new Error("Completed OCR result is missing from secure storage.");
  }

  response.json({
    status: "success",
    ocrStatus: note.ocrStatus,
    pageCount: note.ocrPageCount,
    error: null,
    ...decryptOcrResult(storedResult.encryptedResult),
  });
}

export async function getMyNoteVerification(request, response) {
  const note = await Note.findOne({
    _id: request.params.noteId,
    uploadedBy: request.user._id,
  }).select(
    "verificationStatus verificationError revisionRoot uploadedBy approvalDecision decisionSource publicationStatus moderatedAt moderationReason moderationHistory verifiableStatementCount confirmedErrorCount mistakePercentage humanReviewReason",
  ).populate("moderationHistory.actor", "fullName");
  if (!note) {
    const error = new Error("Note not found.");
    error.statusCode = 404;
    throw error;
  }

  if (note.verificationStatus !== "completed") {
    response.json({
      status: "success",
      verificationStatus: note.verificationStatus,
      decision: note.approvalDecision,
      finalDecision: note.approvalDecision,
      decisionSource: note.decisionSource,
      publicationStatus: note.publicationStatus,
      moderatedAt: note.moderatedAt,
      moderationReason: note.moderationReason,
      moderationHistory: note.moderationHistory.map((entry) => ({
        actor: entry.actor?.fullName ?? "Administrator",
        decision: entry.decision,
        reason: entry.reason,
        createdAt: entry.createdAt,
      })),
      verifiableStatementCount: note.verifiableStatementCount,
      confirmedErrorCount: note.confirmedErrorCount,
      mistakePercentage: note.mistakePercentage ?? null,
      humanReviewReason: note.humanReviewReason ?? "",
      error: note.verificationError ?? null,
      report: null,
    });
    return;
  }

  const storedResult = await NoteVerificationResult.findOne({ note: note._id })
    .select(
      "+encryptedReport model referenceCount createdAt decision verifiableStatementCount confirmedErrorCount mistakePercentage humanReviewReason",
    )
    .lean();
  if (!storedResult) {
    throw new Error("Completed academic verification report is missing from secure storage.");
  }

  response.json({
    status: "success",
    verificationStatus: note.verificationStatus,
    error: null,
    model: storedResult.model,
    referenceCount: storedResult.referenceCount,
    verifiedAt: storedResult.createdAt,
    decision:
      storedResult.decision ??
      (note.approvalDecision === "PENDING"
        ? "NEEDS_HUMAN_REVIEW"
        : note.approvalDecision),
    finalDecision: note.approvalDecision,
    decisionSource: note.decisionSource,
    publicationStatus: note.publicationStatus,
    moderatedAt: note.moderatedAt,
    moderationReason: note.moderationReason,
    moderationHistory: note.moderationHistory.map((entry) => ({
      actor: entry.actor?.fullName ?? "Administrator",
      decision: entry.decision,
      reason: entry.reason,
      createdAt: entry.createdAt,
    })),
    verifiableStatementCount:
      storedResult.verifiableStatementCount ??
      note.verifiableStatementCount ??
      0,
    confirmedErrorCount:
      storedResult.confirmedErrorCount ?? note.confirmedErrorCount ?? 0,
    mistakePercentage:
      storedResult.mistakePercentage ?? note.mistakePercentage ?? null,
    humanReviewReason:
      storedResult.humanReviewReason ?? note.humanReviewReason ?? "",
    report: decryptJson(storedResult.encryptedReport),
    history: await getVerificationHistory(note),
  });
}

async function getVerificationHistory(note) {
  const rootId = note.revisionRoot ?? note._id;
  const revisions = await Note.find({
    $or: [{ revisionRoot: rootId }, { _id: rootId }],
    uploadedBy: note.uploadedBy,
  })
    .select("_id revisionNumber revisionOf title approvalDecision createdAt")
    .sort({ revisionNumber: 1 })
    .lean();
  const revisionIds = revisions.map((revision) => revision._id);
  const history = await NoteVerificationHistory.find({
    revisionRoot: rootId,
    note: { $in: revisionIds },
  })
    .select("+encryptedReport note attempt decision verifiableStatementCount confirmedErrorCount mistakePercentage humanReviewReason model createdAt")
    .sort({ createdAt: 1 })
    .lean();
  return history.map((entry) => ({
    revisionNumber:
      revisions.find((revision) => revision._id.equals(entry.note))
        ?.revisionNumber ?? 1,
    attempt: entry.attempt,
    decision: entry.decision,
    verifiableStatementCount: entry.verifiableStatementCount,
    confirmedErrorCount: entry.confirmedErrorCount,
    mistakePercentage: entry.mistakePercentage,
    humanReviewReason: entry.humanReviewReason,
    model: entry.model,
    verifiedAt: entry.createdAt,
    report: decryptJson(entry.encryptedReport),
  }));
}

export async function deleteMyNote(request, response) {
  const note = await Note.findOne({
    _id: request.params.noteId,
    uploadedBy: request.user._id,
  });
  if (!note) {
    const error = new Error("Note not found.");
    error.statusCode = 404;
    throw error;
  }

  await Promise.all([
    deleteNoteFile(note.storage),
    note.previewStorage ? deleteNotePreview(note.previewStorage) : Promise.resolve(),
  ]);
  await Promise.all([
    NoteOcrJob.deleteOne({ note: note._id }),
    NoteOcrResult.deleteOne({ note: note._id }),
    NoteVerificationJob.deleteOne({ note: note._id }),
    NoteVerificationResult.deleteOne({ note: note._id }),
    NoteVerificationHistory.deleteMany({ note: note._id }),
    removeCommunityReportNotifications(note._id),
    Bookmark.deleteMany({ resourceType: "note", resource: note._id }),
    StudentResourceAccess.deleteMany({
      resourceType: "note",
      resource: note._id,
    }),
    note.deleteOne(),
  ]);

  response.json({ status: "success", message: "Your note was deleted." });
}
