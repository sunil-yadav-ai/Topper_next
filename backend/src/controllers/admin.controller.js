import mongoose from "mongoose";
import Contribution from "../models/Contribution.js";
import Note from "../models/Note.js";
import NoteCommunityReport from "../models/NoteCommunityReport.js";
import NoteOcrResult from "../models/NoteOcrResult.js";
import NoteVerificationResult from "../models/NoteVerificationResult.js";
import Pyq from "../models/Pyq.js";
import PyqReport from "../models/PyqReport.js";
import RewardAccount from "../models/RewardAccount.js";
import User from "../models/User.js";
import { decryptJson } from "../services/encrypted-json.service.js";
import { getRewardBudget } from "../services/reward.service.js";

const maximumPage = 10000;
const pageLimit = 25;

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function parsePage(value) {
  const page = Number(value ?? 1);
  if (!Number.isInteger(page) || page < 1 || page > maximumPage) {
    throw badRequest(`Page must be a whole number between 1 and ${maximumPage}.`);
  }
  return page;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function recentMonthKeys(count = 12) {
  const now = new Date();
  return Array.from({ length: count }, (_value, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - count + 1 + index, 1));
    return date.toISOString().slice(0, 7);
  });
}

async function monthlyCounts(Model, field, startDate, extraMatch = {}) {
  return Model.aggregate([
    { $match: { createdAt: { $gte: startDate }, ...extraMatch } },
    {
      $group: {
        _id: {
          $dateToString: {
            format: "%Y-%m",
            date: "$createdAt",
            timezone: "UTC",
          },
        },
        count: { $sum: 1 },
      },
    },
    { $project: { _id: 1, [field]: "$count" } },
  ]);
}

export async function getAdminOverview(_request, response) {
  const months = recentMonthKeys();
  const startDate = new Date(`${months[0]}-01T00:00:00.000Z`);
  const [
    totalStudents,
    totalNotes,
    totalPyqs,
    pendingAiVerification,
    rejectedNotes,
    needsHumanReview,
    openNoteReports,
    openPyqReports,
    totalNoteReports,
    totalPyqReports,
    rewardBudget,
    monthlyUsers,
    monthlyNotes,
    monthlyPyqs,
    monthlyNoteReports,
    monthlyPyqReports,
    monthlyContributions,
  ] = await Promise.all([
    User.countDocuments({ role: "user" }),
    Note.countDocuments(),
    Pyq.countDocuments(),
    Note.countDocuments({
      $or: [
        { ocrStatus: { $in: ["queued", "processing"] } },
        { verificationStatus: { $in: ["queued", "processing"] } },
      ],
    }),
    Note.countDocuments({ approvalDecision: "REJECTED" }),
    Note.countDocuments({ approvalDecision: "NEEDS_HUMAN_REVIEW" }),
    NoteCommunityReport.countDocuments({ status: "open" }),
    PyqReport.countDocuments({ status: "open" }),
    NoteCommunityReport.countDocuments(),
    PyqReport.countDocuments(),
    getRewardBudget(),
    monthlyCounts(User, "students", startDate, { role: "user" }),
    monthlyCounts(Note, "notes", startDate),
    monthlyCounts(Pyq, "pyqs", startDate),
    monthlyCounts(NoteCommunityReport, "noteReports", startDate),
    monthlyCounts(PyqReport, "pyqReports", startDate),
    monthlyCounts(Contribution, "contributions", startDate),
  ]);

  const byMonth = new Map(
    months.map((month) => [
      month,
      {
        month,
        newStudents: 0,
        notesUploaded: 0,
        pyqsUploaded: 0,
        reportedResources: 0,
        verifiedContributions: 0,
      },
    ]),
  );
  for (const [rows, field, target] of [
    [monthlyUsers, "students", "newStudents"],
    [monthlyNotes, "notes", "notesUploaded"],
    [monthlyPyqs, "pyqs", "pyqsUploaded"],
    [monthlyNoteReports, "noteReports", "reportedResources"],
    [monthlyPyqReports, "pyqReports", "reportedResources"],
    [monthlyContributions, "contributions", "verifiedContributions"],
  ]) {
    for (const row of rows) {
      const month = byMonth.get(row._id);
      if (month) month[target] += row[field] ?? 0;
    }
  }

  response.json({
    status: "success",
    metrics: {
      totalStudents,
      totalNotes,
      totalPyqs,
      pendingAiVerification,
      rejectedNotes,
      needsHumanReview,
      reportedResources: openNoteReports + openPyqReports,
      totalReports: totalNoteReports + totalPyqReports,
      activeStudents: await User.countDocuments({
        role: "user",
        isSuspended: { $ne: true },
      }),
    },
    rewardBudget: {
      initialPoints: rewardBudget.initialPoints,
      availablePoints: rewardBudget.availablePoints,
      distributedPoints: rewardBudget.distributedPoints,
      reclaimedPoints: rewardBudget.reclaimedPoints,
    },
    monthlyAnalytics: [...byMonth.values()],
  });
}

export async function listAdminNotes(request, response) {
  const page = parsePage(request.query.page);
  const decision = request.query.decision ?? "all";
  const filter = {};
  const decisionOptions = {
    needs_review: "NEEDS_HUMAN_REVIEW",
    rejected: "REJECTED",
    approved: ["APPROVED", "APPROVED_WITH_WARNING"],
  };
  if (decision !== "all" && !Object.hasOwn(decisionOptions, decision)) {
    throw badRequest("decision must be all, needs_review, rejected, or approved.");
  }
  if (decision !== "all") {
    filter.approvalDecision = Array.isArray(decisionOptions[decision])
      ? { $in: decisionOptions[decision] }
      : decisionOptions[decision];
  }

  const [notes, total] = await Promise.all([
    Note.find(filter)
      .populate("uploadedBy", "fullName email")
      .populate("moderatedBy", "fullName email")
      .populate("moderationHistory.actor", "fullName")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageLimit)
      .limit(pageLimit)
      .lean(),
    Note.countDocuments(filter),
  ]);
  const noteIds = notes.map((note) => note._id);
  const [verificationResults, ocrResults] = await Promise.all([
    NoteVerificationResult.find({ note: { $in: noteIds } })
      .select("+encryptedReport note model referenceCount createdAt decision verifiableStatementCount confirmedErrorCount mistakePercentage humanReviewReason")
      .lean(),
    NoteOcrResult.find({ note: { $in: noteIds } })
      .select("+encryptedResult note")
      .lean(),
  ]);
  const verificationByNote = new Map(
    verificationResults.map((result) => [result.note.toString(), result]),
  );
  const ocrByNote = new Map(ocrResults.map((result) => [result.note.toString(), result]));

  response.json({
    status: "success",
    notes: notes.map((note) => {
      const verification = verificationByNote.get(note._id.toString());
      const ocr = ocrByNote.get(note._id.toString());
      return {
        id: note._id.toString(),
        title: note.title,
        description: note.description,
        department: note.department,
        batch: note.batch,
        semester: note.semester,
        subject: note.subject,
        unit: note.unit,
        topic: note.topic,
        fileName: note.fileName,
        uploader: note.uploadedBy?.fullName ?? "Student",
        uploaderEmail: note.uploadedBy?.email ?? "",
        uploadedAt: note.createdAt,
        verificationStatus: note.verificationStatus,
        ocrStatus: note.ocrStatus,
        decision: note.approvalDecision,
        decisionSource: note.decisionSource ?? "ai",
        publicationStatus: note.publicationStatus,
        verifiableStatementCount: note.verifiableStatementCount,
        confirmedErrorCount: note.confirmedErrorCount,
        mistakePercentage: note.mistakePercentage ?? null,
        humanReviewReason: note.humanReviewReason ?? "",
        moderatedBy: note.moderatedBy?.fullName ?? "",
        moderatedAt: note.moderatedAt ?? null,
        moderationReason: note.moderationReason ?? "",
        moderationHistory: (note.moderationHistory ?? []).map((entry) => ({
          actor: entry.actor?.fullName ?? "Administrator",
          decision: entry.decision,
          reason: entry.reason,
          createdAt: entry.createdAt,
        })),
        verificationReport: verification
          ? {
              model: verification.model,
              referenceCount: verification.referenceCount,
              verifiedAt: verification.createdAt,
              report: decryptJson(verification.encryptedReport),
            }
          : null,
        ocrPages: ocr ? decryptJson(ocr.encryptedResult).pages : [],
        viewPath: `/search/resources/note/${note._id}/view`,
      };
    }),
    pagination: {
      page,
      limit: pageLimit,
      total,
      pages: Math.ceil(total / pageLimit),
    },
  });
}

export async function listAdminStudents(request, response) {
  const page = parsePage(request.query.page);
  const q = typeof request.query.q === "string" ? request.query.q.trim() : "";
  if (q.length > 120) throw badRequest("Student search must be 120 characters or fewer.");
  const filter = { role: "user" };
  if (q) {
    const match = new RegExp(escapeRegex(q), "i");
    filter.$or = [
      { fullName: match },
      { email: match },
      { university: match },
      { department: match },
    ];
  }
  const [students, total] = await Promise.all([
    User.find(filter)
      .select("fullName email university department batch semester emailVerified isSuspended suspendedAt suspendedBy suspensionReason createdAt")
      .populate("suspendedBy", "fullName")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageLimit)
      .limit(pageLimit)
      .lean(),
    User.countDocuments(filter),
  ]);
  const studentIds = students.map((student) => student._id);
  const [accounts, notes, pyqs] = await Promise.all([
    RewardAccount.find({ user: { $in: studentIds } }).select("user points").lean(),
    Note.aggregate([
      { $match: { uploadedBy: { $in: studentIds } } },
      { $group: { _id: "$uploadedBy", count: { $sum: 1 } } },
    ]),
    Pyq.aggregate([
      { $match: { uploadedBy: { $in: studentIds } } },
      { $group: { _id: "$uploadedBy", count: { $sum: 1 } } },
    ]),
  ]);
  const accountByUser = new Map(accounts.map((item) => [item.user.toString(), item.points]));
  const noteCountByUser = new Map(notes.map((item) => [item._id.toString(), item.count]));
  const pyqCountByUser = new Map(pyqs.map((item) => [item._id.toString(), item.count]));
  response.json({
    status: "success",
    students: students.map((student) => ({
      id: student._id.toString(),
      fullName: student.fullName,
      email: student.email,
      university: student.university,
      department: student.department,
      batch: student.batch,
      semester: student.semester,
      emailVerified: student.emailVerified,
      isSuspended: student.isSuspended ?? false,
      suspendedAt: student.suspendedAt,
      suspendedBy: student.suspendedBy?.fullName ?? "",
      suspensionReason: student.suspensionReason ?? "",
      createdAt: student.createdAt,
      rewardPoints: accountByUser.get(student._id.toString()) ?? 0,
      uploadedNotes: noteCountByUser.get(student._id.toString()) ?? 0,
      uploadedPyqs: pyqCountByUser.get(student._id.toString()) ?? 0,
    })),
    pagination: {
      page,
      limit: pageLimit,
      total,
      pages: Math.ceil(total / pageLimit),
    },
  });
}

export async function setStudentSuspension(request, response) {
  if (!mongoose.isValidObjectId(request.params.studentId)) {
    throw badRequest("Student ID is invalid.");
  }
  const { suspended, reason } = request.body ?? {};
  if (typeof suspended !== "boolean") {
    throw badRequest("suspended must be true or false.");
  }
  const normalizedReason = typeof reason === "string" ? reason.trim() : "";
  if (!normalizedReason || normalizedReason.length > 500) {
    throw badRequest("A suspension action reason of 1 to 500 characters is required.");
  }

  const student = await User.findOneAndUpdate(
    { _id: request.params.studentId, role: "user" },
    {
      $set: {
        isSuspended: suspended,
        suspendedAt: suspended ? new Date() : null,
        suspendedBy: suspended ? request.user._id : null,
        suspensionReason: suspended ? normalizedReason : "",
      },
      $inc: { authVersion: 1 },
      $push: {
        suspensionHistory: {
          actor: request.user._id,
          action: suspended ? "suspended" : "reinstated",
          reason: normalizedReason,
          createdAt: new Date(),
        },
      },
    },
    { new: true, runValidators: true },
  ).select("fullName email isSuspended suspensionReason suspendedAt");
  if (!student) {
    const error = new Error("Student account not found.");
    error.statusCode = 404;
    throw error;
  }
  response.json({
    status: "success",
    message: suspended
      ? "Student account suspended and active sessions invalidated."
      : "Student account reinstated. They can sign in again.",
    student,
  });
}

export async function listAdminPyqReports(request, response) {
  const page = parsePage(request.query.page);
  const status = request.query.status ?? "open";
  if (!["open", "reviewed", "dismissed", "all"].includes(status)) {
    throw badRequest("status must be open, reviewed, dismissed, or all.");
  }
  const filter = status === "all" ? {} : { status };
  const [reports, total] = await Promise.all([
    PyqReport.find(filter)
      .populate("pyq", "university college department course semester subject examinationYear examType fileName")
      .populate("reportedBy", "fullName email")
      .populate("reviewedBy", "fullName")
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * pageLimit)
      .limit(pageLimit)
      .lean(),
    PyqReport.countDocuments(filter),
  ]);
  response.json({
    status: "success",
    reports: reports.map((report) => ({
      id: report._id.toString(),
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt,
      reviewedAt: report.reviewedAt,
      reviewNote: report.reviewNote,
      reportedBy: report.reportedBy?.fullName ?? "Student",
      reportedByEmail: report.reportedBy?.email ?? "",
      pyq: report.pyq
        ? {
            id: report.pyq._id.toString(),
            university: report.pyq.university,
            college: report.pyq.college,
            department: report.pyq.department,
            course: report.pyq.course,
            semester: report.pyq.semester,
            subject: report.pyq.subject,
            examinationYear: report.pyq.examinationYear,
            examType: report.pyq.examType,
            viewPath: `/search/resources/pyq/${report.pyq._id}/view`,
          }
        : null,
    })),
    pagination: {
      page,
      limit: pageLimit,
      total,
      pages: Math.ceil(total / pageLimit),
    },
  });
}

export async function reviewAdminPyqReport(request, response) {
  if (!mongoose.isValidObjectId(request.params.reportId)) {
    throw badRequest("PYQ report ID is invalid.");
  }
  const { decision, reviewNote = "" } = request.body ?? {};
  if (!["reviewed", "dismissed"].includes(decision)) {
    throw badRequest("Decision must be reviewed or dismissed.");
  }
  if (typeof reviewNote !== "string" || reviewNote.trim().length > 1000) {
    throw badRequest("Review note must be 1000 characters or fewer.");
  }
  const report = await PyqReport.findOneAndUpdate(
    { _id: request.params.reportId, status: "open" },
    {
      $set: {
        status: decision,
        reviewedBy: request.user._id,
        reviewedAt: new Date(),
        reviewNote: reviewNote.trim(),
      },
    },
    { new: true, runValidators: true },
  );
  if (!report) {
    const error = new Error("Open PYQ report not found.");
    error.statusCode = 404;
    throw error;
  }
  response.json({
    status: "success",
    message: `PYQ report ${decision}. No student reward points were automatically changed.`,
  });
}
