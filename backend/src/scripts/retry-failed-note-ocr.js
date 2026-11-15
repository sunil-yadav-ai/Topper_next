import mongoose from "mongoose";
import { env } from "../config/env.js";
import Note from "../models/Note.js";
import NoteOcrJob from "../models/NoteOcrJob.js";
import NoteVerificationJob from "../models/NoteVerificationJob.js";

const apply = process.argv.includes("--apply");
const includePublished = process.argv.includes("--include-published");

await mongoose.connect(env.mongodbUri);

try {
  const notes = await Note.find({
    publicationStatus: includePublished
      ? { $in: ["private", "published"] }
      : "private",
    ocrStatus: "failed",
  })
    .select(
    "_id title publicationStatus ocrStatus ocrError approvalDecision verificationStatus verificationError humanReviewReason",
    )
    .sort({ createdAt: 1 })
    .lean();
  const retryable = [];

  for (const note of notes) {
    const ocrJob = await NoteOcrJob.findOne({
      note: note._id,
      status: "failed",
    })
      .select("_id attempts")
      .lean();
    const verificationJob = await NoteVerificationJob.findOne({
      note: note._id,
    })
      .select("_id status attempts")
      .lean();

    if (note.publicationStatus === "published") {
      if (includePublished && ocrJob) {
        retryable.push({
          id: note._id.toString(),
          title: note.title,
          publicationStatus: "published",
          ocrError: note.ocrError,
          ocrAttempts: ocrJob.attempts,
        });
      }
      continue;
    }

    if (
      ocrJob &&
      verificationJob &&
      ["completed", "failed"].includes(verificationJob.status)
    ) {
      retryable.push({
        id: note._id.toString(),
        title: note.title,
        ocrError: note.ocrError,
        approvalDecision: note.approvalDecision,
        noteVerificationStatus: note.verificationStatus,
        verificationError: note.verificationError,
        humanReviewReason: note.humanReviewReason,
        ocrAttempts: ocrJob.attempts,
        verificationJobStatus: verificationJob.status,
        verificationAttempts: verificationJob.attempts,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        matchedNotes: notes.length,
        retryableNotes: retryable.map(
          ({ id, title, publicationStatus, ocrAttempts, verificationJobStatus }) => ({
            id,
            title,
            publicationStatus: publicationStatus ?? "private",
            ocrAttempts,
            verificationJobStatus,
          }),
        ),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("No changes made. Pass --apply to queue these OCR retries.");
  } else {
    for (const note of retryable) {
      const noteId = new mongoose.Types.ObjectId(note.id);
      if (note.publicationStatus === "published") {
        const updatedNote = await Note.updateOne(
          {
            _id: noteId,
            publicationStatus: "published",
            ocrStatus: "failed",
          },
          {
            $set: { ocrStatus: "queued" },
            $unset: { ocrError: "" },
          },
        );
        if (updatedNote.modifiedCount !== 1) {
          throw new Error(`Could not requeue published note OCR ${note.id}.`);
        }

        const ocrJob = await NoteOcrJob.updateOne(
          { note: noteId, status: "failed" },
          {
            $set: {
              status: "queued",
              attempts: 0,
              retryAt: null,
              leaseAt: null,
              lastError: "",
            },
          },
        );
        if (ocrJob.modifiedCount !== 1) {
          await Note.updateOne(
            { _id: noteId, publicationStatus: "published", ocrStatus: "queued" },
            {
              $set: {
                ocrStatus: "failed",
                ...(note.ocrError ? { ocrError: note.ocrError } : {}),
              },
              ...(!note.ocrError ? { $unset: { ocrError: "" } } : {}),
            },
          );
          throw new Error(`Could not reset OCR job for published note ${note.id}.`);
        }
        continue;
      }

      const updatedNote = await Note.updateOne(
        {
          _id: noteId,
          publicationStatus: "private",
          ocrStatus: "failed",
        },
        {
          $set: {
            ocrStatus: "queued",
            verificationStatus: "queued",
            verificationError: "",
            approvalDecision: "PENDING",
            humanReviewReason: "",
            visibility: "private",
          },
          $unset: { ocrError: "" },
        },
      );
      if (updatedNote.modifiedCount !== 1) {
        throw new Error(`Could not requeue private note ${note.id}.`);
      }

      try {
        const verificationJob = await NoteVerificationJob.updateOne(
          { note: noteId },
          {
            $set: {
              status: "queued",
              attempts: 0,
              leaseAt: null,
              lastError: "",
            },
          },
        );
        if (verificationJob.modifiedCount !== 1) {
          throw new Error(`Could not reset verification job for note ${note.id}.`);
        }

        const ocrJob = await NoteOcrJob.updateOne(
          { note: noteId, status: "failed" },
          {
            $set: {
              status: "queued",
              attempts: 0,
              retryAt: null,
              leaseAt: null,
            },
          },
        );
        if (ocrJob.modifiedCount !== 1) {
          throw new Error(`Could not reset OCR job for note ${note.id}.`);
        }
      } catch (error) {
        await Promise.all([
          NoteVerificationJob.updateOne(
            { note: noteId, status: "queued", attempts: 0 },
            {
              $set: {
                status: note.verificationJobStatus,
                attempts: note.verificationAttempts,
                lastError: "",
              },
            },
          ),
          Note.updateOne(
            { _id: noteId, publicationStatus: "private", ocrStatus: "queued" },
            {
              $set: {
                ocrStatus: "failed",
                verificationStatus: note.noteVerificationStatus,
                approvalDecision: note.approvalDecision,
                verificationError: note.verificationError,
                humanReviewReason: note.humanReviewReason,
                ...(note.ocrError ? { ocrError: note.ocrError } : {}),
              },
              ...(note.ocrError ? {} : { $unset: { ocrError: "" } }),
            },
          ),
        ]);
        throw error;
      }
    }
    console.log(`Queued OCR retries for ${retryable.length} note(s).`);
  }
} finally {
  await mongoose.disconnect();
}
