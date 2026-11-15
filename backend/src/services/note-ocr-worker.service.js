import Note from "../models/Note.js";
import NoteOcrJob from "../models/NoteOcrJob.js";
import NoteOcrResult from "../models/NoteOcrResult.js";
import NoteVerificationJob from "../models/NoteVerificationJob.js";
import NoteVerificationHistory from "../models/NoteVerificationHistory.js";
import NoteVerificationResult from "../models/NoteVerificationResult.js";
import { createNotification } from "./notification.service.js";
import {
  encryptOcrResult,
  extractNoteText,
} from "./note-ocr.service.js";
import { decryptJson, encryptJson } from "./encrypted-json.service.js";
import { verifyAcademicNotes } from "./note-verification.service.js";
import {
  decideNoteApproval,
  getNotePublicationFields,
} from "./note-approval.service.js";
import { sendNoteDecisionEmail } from "./note-decision-notification.service.js";
import { awardContribution } from "./reward.service.js";
import {
  buildNoteSearchFields,
  createSearchNgrams,
} from "./resource-search-index.service.js";

const maxAttempts = 3;
const leaseDurationMs = 5 * 60 * 1000;
const pollIntervalMs = 3000;
let workerStarted = false;
let processing = false;

export function shouldExhaustOcrJob(error, attempts) {
  if (error.retryableRateLimit === true) return false;
  if (error.retryableRateLimit === false) return true;
  return attempts >= maxAttempts;
}

async function finalizeVerification({ note, job, report, model }) {
  const decision = decideNoteApproval(report);
  const publicationFields = getNotePublicationFields(decision.decision);
  const completeReport = { ...report, ...decision };
  const encryptedReport = encryptJson(completeReport);
  const revisionRoot = note.revisionRoot ?? note._id;
  const referenceCount = new Set(
    report.issues.flatMap((issue) =>
      issue.references.map((reference) => reference.url),
    ),
  ).size;

  await Promise.all([
    NoteVerificationResult.findOneAndUpdate(
      { note: note._id },
      {
        $set: {
          encryptedReport,
          model,
          referenceCount,
          decision: decision.decision,
          verifiableStatementCount: decision.verifiableStatementCount,
          confirmedErrorCount: decision.confirmedErrorCount,
          mistakePercentage: decision.mistakePercentage,
          humanReviewReason: decision.humanReviewReason,
        },
      },
      { upsert: true, new: true, runValidators: true },
    ),
    NoteVerificationHistory.findOneAndUpdate(
      { note: note._id, attempt: job.attempts },
      {
        $set: {
          revisionRoot,
          decision: decision.decision,
          verifiableStatementCount: decision.verifiableStatementCount,
          confirmedErrorCount: decision.confirmedErrorCount,
          mistakePercentage: decision.mistakePercentage,
          humanReviewReason: decision.humanReviewReason,
          encryptedReport,
          model,
        },
      },
      { upsert: true, new: true, runValidators: true },
    ),
    Note.updateOne(
      { _id: note._id },
      {
        $set: {
          verificationStatus: "completed",
          verificationError: "",
          approvalDecision: decision.decision,
          decisionSource: "ai",
          verifiableStatementCount: decision.verifiableStatementCount,
          confirmedErrorCount: decision.confirmedErrorCount,
          mistakePercentage: decision.mistakePercentage,
          humanReviewReason: decision.humanReviewReason,
          ...publicationFields,
        },
      },
    ),
    job.updateOne({
      $set: { status: "completed", leaseAt: null, lastError: "" },
    }),
  ]);
  const notificationKey = `note-decision:ai:${note._id}`;
  const notifications = [];
  if (decision.decision === "APPROVED") {
    notifications.push(
      createNotification({
        recipient: note.uploadedBy,
        type: "note_approved",
        title: "AI verification complete",
        message: `"${note.title}" passed AI verification and is publicly available.`,
        link: "/library",
        dedupeKey: notificationKey,
      }),
    );
  } else if (decision.decision === "APPROVED_WITH_WARNING") {
    notifications.push(
      createNotification({
        recipient: note.uploadedBy,
        type: "note_approved",
        title: "AI verification passed with warnings",
        message: `"${note.title}" is published. Review the academic verification report for suggested corrections.`,
        link: "/library",
        dedupeKey: notificationKey,
      }),
      createNotification({
        recipient: note.uploadedBy,
        type: "corrections_required",
        title: "Review suggested corrections",
        message: `The verification report for "${note.title}" contains findings to review. Your original notes have not been changed.`,
        link: "/library",
        dedupeKey: `note-corrections:ai:${note._id}`,
      }),
    );
  } else if (decision.decision === "REJECTED") {
    notifications.push(
      createNotification({
        recipient: note.uploadedBy,
        type: "note_rejected",
        title: "AI verification flagged possible errors",
        message: `"${note.title}" remains public. Review the detailed report and optionally upload a corrected version.`,
        link: "/library",
        dedupeKey: notificationKey,
      }),
      createNotification({
        recipient: note.uploadedBy,
        type: "corrections_required",
        title: "Corrections required",
        message: `Review the suggested corrections for "${note.title}". You can upload a corrected version at any time; the original remains unchanged and public.`,
        link: "/library",
        dedupeKey: `note-corrections:ai:${note._id}`,
      }),
    );
  }
  if (notifications.length) {
    try {
      await Promise.all(notifications);
    } catch (error) {
      console.error(`Could not create in-app verification notifications for note ${note._id}:`, error);
    }
  }
  if (["APPROVED", "APPROVED_WITH_WARNING"].includes(decision.decision)) {
    try {
      const reward = await awardContribution({
        userId: note.uploadedBy,
        type: "handwritten_note",
        sourceType: "note",
        sourceId: note._id,
        title: note.title,
      });
      if (reward.unfunded) {
        console.warn(`No reward budget was available for approved note ${note._id}.`);
      }
    } catch (error) {
      console.error(`Could not reward the uploader of approved note ${note._id}:`, error);
    }
  }
  await sendNoteDecisionEmail(note._id);
}

async function processNextOcrJob() {
  const now = new Date();
  const job = await NoteOcrJob.findOneAndUpdate(
    {
      $or: [
        {
          $and: [
            { status: "queued" },
            { $or: [{ retryAt: null }, { retryAt: { $lte: now } }] },
          ],
        },
        {
          status: "processing",
          leaseAt: { $lt: new Date(now.getTime() - leaseDurationMs) },
        },
      ],
    },
    {
      $set: { status: "processing", leaseAt: now, retryAt: null },
      $inc: { attempts: 1 },
    },
    { sort: { createdAt: 1 }, new: true },
  );
  if (!job) return;

  const note = await Note.findById(job.note);
  if (!note) {
    await job.deleteOne();
    return;
  }
  await Note.updateOne(
    { _id: note._id },
    { $set: { ocrStatus: "processing", ocrError: "" } },
  );

  try {
    const result = await extractNoteText(
      note,
      () => job.updateOne({ $set: { leaseAt: new Date() } }),
      note.uploadedBy,
    );
    const encryptedResult = encryptOcrResult(result);
    await NoteOcrResult.findOneAndUpdate(
      { note: note._id },
      { $set: { encryptedResult } },
      { upsert: true, new: true, runValidators: true },
    );
    await Promise.all([
      job.updateOne({
        $set: { status: "completed", leaseAt: null, retryAt: null, lastError: "" },
      }),
      Note.updateOne(
        { _id: note._id },
        {
          $set: {
            ocrStatus: "completed",
            ocrPageCount: result.pages.length,
            ocrError: "",
            searchNgrams: createSearchNgrams(buildNoteSearchFields(note, result)),
            searchIndexVersion: 1,
          },
        },
      ),
    ]);
  } catch (error) {
    console.error(`OCR processing failed for note ${note._id}:`, error);
    const exhausted = shouldExhaustOcrJob(error, job.attempts);
    const message = error.expose
      ? error.message
      : exhausted
        ? "Text extraction failed after several attempts. Your original note is unchanged."
        : "Text extraction failed temporarily and will be retried.";
    const retryDelayMs = Number.isFinite(error.retryAfterMs)
      ? Math.max(0, error.retryAfterMs)
      : Math.min(1000 * 2 ** (job.attempts - 1), 30_000);
    await Promise.all([
      job.updateOne({
        $set: {
          status: exhausted ? "failed" : "queued",
          leaseAt: null,
          retryAt: exhausted ? null : new Date(Date.now() + retryDelayMs),
          lastError: message,
        },
      }),
      Note.updateOne(
        { _id: note._id },
        {
          $set: {
            ocrStatus: exhausted ? "failed" : "queued",
            ...(exhausted ? { ocrError: message } : {}),
          },
        },
      ),
    ]);
  }
}

async function processNextVerificationJob() {
  const staleLease = new Date(Date.now() - leaseDurationMs);
  const candidates = await NoteVerificationJob.find({
    $or: [
      { status: "queued" },
      { status: "processing", leaseAt: { $lt: staleLease } },
    ],
  })
    .sort({ createdAt: 1 })
    .limit(20)
    .select("_id note status");
  let candidate;
  let note;
  for (const queuedCandidate of candidates) {
    const queuedNote = await Note.findById(queuedCandidate.note);
    if (!queuedNote) {
      await queuedCandidate.deleteOne();
      continue;
    }
    if (["queued", "processing"].includes(queuedNote.ocrStatus)) continue;
    candidate = queuedCandidate;
    note = queuedNote;
    break;
  }
  if (!candidate) return;

  const now = new Date();
  const job = await NoteVerificationJob.findOneAndUpdate(
    {
      _id: candidate._id,
      status: candidate.status,
      ...(candidate.status === "processing"
        ? { leaseAt: { $lt: staleLease } }
        : {}),
    },
    {
      $set: { status: "processing", leaseAt: now, lastError: "" },
      $inc: { attempts: 1 },
    },
    { new: true },
  );
  if (!job) return;

  if (note.ocrStatus !== "completed") {
    const message = "Academic verification could not run because note OCR did not complete.";
    await finalizeVerification({
      note,
      job,
      model: "human-review-required",
      report: {
        overallClassification: "UNCERTAIN",
        issueCount: 0,
        confirmedErrorCount: 0,
        uncertainCount: 0,
        issues: [],
        pages: [],
        totalVerifiableStatements: 0,
        analysisReliable: false,
        analysisLimitations: [message],
        unreadablePageCount: 0,
      },
    });
    return;
  }

  await Note.updateOne(
    { _id: note._id },
    { $set: { verificationStatus: "processing", verificationError: "" } },
  );
  try {
    await createNotification({
      recipient: note.uploadedBy,
      type: "verification_started",
      title: "AI verification started",
      message: `OCR is complete. AI academic verification has started for "${note.title}".`,
      link: "/library",
      dedupeKey: `note-verification-started:${note._id}:${job.attempts}`,
    });
  } catch (error) {
    console.error(`Could not create verification-started notification for note ${note._id}:`, error);
  }

  try {
    const storedOcrResult = await NoteOcrResult.findOne({ note: note._id })
        .select("+encryptedResult")
        .lean();
    if (!storedOcrResult) {
      throw new Error("Completed OCR result is missing from secure storage.");
    }

    const verification = await verifyAcademicNotes({
      note,
      ocrResult: decryptJson(storedOcrResult.encryptedResult),
    });
    await finalizeVerification({
      note,
      job,
      report: verification.report,
      model: verification.model,
    });
  } catch (error) {
    console.error(`Academic verification failed for note ${note._id}:`, error);
    const exhausted =
      error.retryableRateLimit === false || job.attempts >= maxAttempts;
    const message = error.expose
      ? error.message
      : exhausted
      ? "Academic verification failed after several attempts. Your original notes are unchanged."
      : "Academic verification failed temporarily and will be retried.";
    if (exhausted) {
      await finalizeVerification({
        note,
        job,
        model: "human-review-required",
        report: {
          overallClassification: "UNCERTAIN",
          issueCount: 0,
          confirmedErrorCount: 0,
          uncertainCount: 0,
          issues: [],
          pages: [],
          totalVerifiableStatements: 0,
          analysisReliable: false,
          analysisLimitations: [message],
          unreadablePageCount: 0,
        },
      });
      return;
    }
    await Promise.all([
      job.updateOne({
        $set: {
          status: exhausted ? "failed" : "queued",
          leaseAt: null,
          lastError: message,
        },
      }),
      Note.updateOne(
        { _id: note._id },
        {
          $set: {
            verificationStatus: exhausted ? "failed" : "queued",
            ...(exhausted ? { verificationError: message } : {}),
          },
        },
      ),
    ]);
  }
}

export function startNoteOcrWorker() {
  if (workerStarted) return;
  workerStarted = true;

  const poll = async () => {
    if (processing) return;
    processing = true;
    try {
      await processNextOcrJob();
      await processNextVerificationJob();
    } catch (error) {
      console.error("Note OCR worker failed to process its queue:", error);
    } finally {
      processing = false;
    }
  };

  void poll();
  const timer = setInterval(() => void poll(), pollIntervalMs);
  timer.unref();
}
