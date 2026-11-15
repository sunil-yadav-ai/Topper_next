import mongoose from "mongoose";
import Note from "../models/Note.js";
import NoteCommunityReport from "../models/NoteCommunityReport.js";
import User from "../models/User.js";
import { sendEmailSafely } from "../services/email-notification.service.js";
import {
  awardContribution,
  isRewardableCorrectionCategory,
} from "../services/reward.service.js";
import { createNotification } from "../services/notification.service.js";

const categories = new Set([
  "incorrect_definition",
  "wrong_formula",
  "incorrect_calculation",
  "missing_explanation",
  "poor_readability",
  "duplicate_content",
]);

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function serializeReport(report) {
  return {
    id: report._id.toString(),
    note: report.note
      ? {
          id: report.note._id.toString(),
          title: report.note.title,
          subject: report.note.subject,
          uploadedBy: report.note.uploadedBy?._id?.toString() ?? "",
          uploaderName: report.note.uploadedBy?.fullName ?? "",
        }
      : null,
    reportedBy: report.reportedBy
      ? {
          id: report.reportedBy._id.toString(),
          fullName: report.reportedBy.fullName,
        }
      : null,
    pageNumber: report.pageNumber,
    category: report.category,
    explanation: report.explanation,
    suggestedCorrection: report.suggestedCorrection,
    uploaderResponse: report.uploaderResponse,
    status: report.status,
    reviewedAt: report.reviewedAt,
    history: report.history,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

async function notifyRecipient(reportId, recipientId, subject, text) {
  try {
    const recipient = await User.findById(recipientId).select("email");
    if (!recipient) {
      console.error(`Email recipient not found for community report ${reportId}.`);
      return;
    }
    await sendEmailSafely({
      id: `community-report-${reportId}-${recipientId}`,
      to: recipient.email,
      subject,
      text,
    });
  } catch (error) {
    const code = typeof error?.code === "string" ? error.code : "UNKNOWN";
    console.error(`Could not prepare community report email (code: ${code}).`);
  }
}

async function populateReportQuery(query) {
  return query
    .populate({
      path: "note",
      select: "title subject uploadedBy",
      populate: { path: "uploadedBy", select: "fullName" },
    })
    .populate("reportedBy", "fullName")
    .sort({ createdAt: -1 })
    .lean();
}

async function getPopulatedReport(reportId) {
  return NoteCommunityReport.findById(reportId)
    .populate({
      path: "note",
      select: "title subject uploadedBy",
      populate: { path: "uploadedBy", select: "fullName" },
    })
    .populate("reportedBy", "fullName")
    .lean();
}

export async function createNoteCommunityReport(request, response) {
  if (!mongoose.isValidObjectId(request.params.noteId)) {
    throw badRequest("Note ID is invalid.");
  }
  const note = await Note.findOne({
    _id: request.params.noteId,
    publicationStatus: "published",
  }).select("title uploadedBy ocrPageCount");
  if (!note) throw notFound("Published note not found.");
  if (note.uploadedBy.equals(request.user._id)) {
    throw badRequest("You cannot report your own note.");
  }

  const pageNumber = Number(request.body.pageNumber);
  const maxPage = note.ocrPageCount || 10000;
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > maxPage) {
    throw badRequest(`Page number must be between 1 and ${maxPage}.`);
  }
  if (!categories.has(request.body.category)) {
    throw badRequest("Choose a valid mistake category.");
  }
  const explanation =
    typeof request.body.explanation === "string"
      ? request.body.explanation.trim()
      : "";
  const suggestedCorrection =
    typeof request.body.suggestedCorrection === "string"
      ? request.body.suggestedCorrection.trim()
      : "";
  if (!explanation || explanation.length > 2000) {
    throw badRequest("Explain the issue in 1 to 2000 characters.");
  }
  if (suggestedCorrection.length > 2000) {
    throw badRequest("Suggested correction must be 2000 characters or fewer.");
  }

  let report;
  try {
    report = await NoteCommunityReport.create({
      note: note._id,
      reportedBy: request.user._id,
      pageNumber,
      category: request.body.category,
      explanation,
      suggestedCorrection,
      status: "open",
      history: [
        {
          actor: request.user._id,
          actorRole: "student",
          action: "reported",
          message: explanation,
          status: "open",
        },
      ],
    });
  } catch (error) {
    if (error.code === 11000) {
      error.statusCode = 409;
      error.message = "You have already reported this issue on that page.";
    }
    throw error;
  }

  const reporter = await User.findById(request.user._id).select("fullName");
  await notifyRecipient(
    report._id,
    note.uploadedBy,
    `A student reported an issue in "${note.title}"`,
    [
      `Hello,`,
      "",
      `${reporter?.fullName ?? "A student"} reported ${request.body.category.replaceAll("_", " ")} on page ${pageNumber}.`,
      `Note: ${note.title}`,
      `Details: ${explanation}`,
      suggestedCorrection ? `Suggested correction: ${suggestedCorrection}` : "",
      "Sign in to Topper to review and respond.",
    ]
      .filter(Boolean)
      .join("\n"),
  );
  try {
    await createNotification({
      recipient: note.uploadedBy,
      type: "mistake_reported",
      title: `A student reported an issue in "${note.title}"`,
      message: `${reporter?.fullName ?? "A student"} reported ${request.body.category.replaceAll("_", " ")} on page ${pageNumber}.${suggestedCorrection ? ` Suggested correction: ${suggestedCorrection}` : ""}`,
      link: "/library",
      dedupeKey: `community-report:submitted:${report._id}`,
    });
  } catch (error) {
    console.error(`Could not create in-app report notification for report ${report._id}:`, error);
  }

  response.status(201).json({
    status: "success",
    message: "Report submitted. The note uploader has been notified; no contributor points were changed.",
    report: serializeReport(await getPopulatedReport(report._id)),
  });
}

export async function getMyNoteCommunityReports(request, response) {
  const ownedNotes = await Note.find({ uploadedBy: request.user._id }).select("_id").lean();
  const reports = await populateReportQuery(
    NoteCommunityReport.find({
      $or: [
        { reportedBy: request.user._id },
        { note: { $in: ownedNotes.map((note) => note._id) } },
      ],
    }),
  );
  response.json({
    status: "success",
    reports: reports.map(serializeReport),
  });
}

export async function respondToNoteCommunityReport(request, response) {
  if (!mongoose.isValidObjectId(request.params.reportId)) {
    throw badRequest("Report ID is invalid.");
  }
  const responseText =
    typeof request.body.response === "string" ? request.body.response.trim() : "";
  if (!responseText || responseText.length > 2000) {
    throw badRequest("Response must be between 1 and 2000 characters.");
  }

  const report = await NoteCommunityReport.findById(request.params.reportId);
  if (!report) throw notFound("Community report not found.");
  const note = await Note.findOne({
    _id: report.note,
    uploadedBy: request.user._id,
  }).select("title");
  if (!note) throw notFound("Community report not found.");
  if (report.status !== "open") {
    const error = new Error("This report has already been reviewed by an administrator.");
    error.statusCode = 409;
    throw error;
  }

  report.uploaderResponse = responseText;
  report.history.push({
    actor: request.user._id,
    actorRole: "student",
    action: "uploader_responded",
    message: responseText,
    status: report.status,
  });
  await report.save();

  await notifyRecipient(
    report._id,
    report.reportedBy,
    `The uploader responded to your report on "${note.title}"`,
    `The uploader responded to your page ${report.pageNumber} report:\n\n${responseText}\n\nThe report remains open for administrator review.`,
  );

  response.json({
    status: "success",
    message: "Your response was recorded and the student who reported the issue was notified.",
    report: serializeReport(
      await getPopulatedReport(report._id),
    ),
  });
}

export async function getCommunityReportsForReview(_request, response) {
  const reports = await populateReportQuery(
    NoteCommunityReport.find({ status: "open" }).limit(200),
  );
  response.json({
    status: "success",
    reports: reports.map(serializeReport),
  });
}

export async function reviewNoteCommunityReport(request, response) {
  if (!mongoose.isValidObjectId(request.params.reportId)) {
    throw badRequest("Report ID is invalid.");
  }
  const { decision, reviewNote = "" } = request.body;
  if (!["confirmed", "dismissed"].includes(decision)) {
    throw badRequest("Decision must be confirmed or dismissed.");
  }
  if (typeof reviewNote !== "string" || reviewNote.trim().length > 2000) {
    throw badRequest("Review note must be 2000 characters or fewer.");
  }
  const report = await NoteCommunityReport.findOneAndUpdate(
    { _id: request.params.reportId, status: "open" },
    {
      $set: {
        status: decision,
        reviewedBy: request.user._id,
        reviewedAt: new Date(),
      },
      $push: {
        history: {
          actor: request.user._id,
          actorRole: "admin",
          action: decision,
          message: reviewNote.trim(),
          status: decision,
          createdAt: new Date(),
        },
      },
    },
    { new: true, runValidators: true },
  );
  if (!report) throw notFound("Open community report not found.");

  const note = await Note.findById(report.note).select("title uploadedBy");
  let rewardMessage = "";
  if (
    decision === "confirmed" &&
    isRewardableCorrectionCategory(report.category)
  ) {
    try {
      const reward = await awardContribution({
        userId: report.reportedBy,
        actorId: report.reportedBy,
        reviewerId: request.user._id,
        type: "verified_correction",
        sourceType: "community_report",
        sourceId: report._id,
        title: `Verified correction: ${report.category.replaceAll("_", " ")}`,
        reason: `Administrator-confirmed ${report.category.replaceAll("_", " ")} on page ${report.pageNumber}.`,
      });
      rewardMessage = reward.awarded
        ? ` The reporting student earned ${reward.points} points.`
        : reward.unfunded
          ? " No points were distributed because the platform reward budget is exhausted."
          : "";
    } catch (error) {
      console.error(`Could not reward verified correction ${report._id}:`, error);
      rewardMessage = " Reward distribution needs administrator follow-up.";
    }
  }
  const text = [
    `An administrator ${decision} the community report for "${note?.title ?? "your note"}".`,
    `Page: ${report.pageNumber}`,
    `Category: ${report.category.replaceAll("_", " ")}`,
    reviewNote.trim() ? `Review: ${reviewNote.trim()}` : "",
    decision === "confirmed"
      ? `The issue was reviewed and confirmed. Your original uploaded file remains unchanged.${rewardMessage}`
      : "The report was reviewed and dismissed. No correction or contributor-point change was made.",
  ]
    .filter(Boolean)
    .join("\n");
  const recipients = [...new Set([report.reportedBy.toString(), note?.uploadedBy?.toString()].filter(Boolean))];
  await Promise.all(
    recipients.map((recipient) =>
      notifyRecipient(
        report._id,
        recipient,
        `Community report ${decision}: ${note?.title ?? "published note"}`,
        text,
      ),
    ),
  );
  try {
    await Promise.all(
      recipients.map((recipient) =>
        createNotification({
          recipient,
          type: "mistake_resolved",
          title: `Community report ${decision}: ${note?.title ?? "published note"}`,
          message: [
            `An administrator ${decision} the page ${report.pageNumber} report for "${note?.title ?? "your note"}".`,
            `Category: ${report.category.replaceAll("_", " ")}`,
            reviewNote.trim() ? `Review: ${reviewNote.trim()}` : "",
            decision === "confirmed"
              ? "The issue was reviewed and confirmed. The original uploaded file remains unchanged."
              : "The report was reviewed and dismissed. No correction or contributor-point change was made.",
          ].filter(Boolean).join(" "),
          link: "/library",
          dedupeKey: `community-report:resolved:${report._id}`,
        }),
      ),
    );
  } catch (error) {
    console.error(`Could not create in-app resolution notifications for report ${report._id}:`, error);
  }

  response.json({
    status: "success",
    message: decision === "confirmed"
      ? `Issue confirmed after review.${rewardMessage}`
      : "Report dismissed after review. No contributor points were changed.",
    report: serializeReport(
      await getPopulatedReport(report._id),
    ),
  });
}

export async function removeCommunityReportNotifications(noteId) {
  await NoteCommunityReport.deleteMany({ note: noteId });
}
