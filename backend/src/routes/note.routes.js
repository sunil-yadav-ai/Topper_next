import { Router } from "../lib/router.js";
import {
  createNote,
  deleteMyNote,
  getMyNotes,
  getMyNoteOcr,
  getMyNoteVerification,
  getPublishedNotes,
  resubmitCorrectedNote,
} from "../controllers/note.controller.js";
import { receiveMultipart } from "../middleware/next-upload.js";
import {
  createNoteCommunityReport,
  getCommunityReportsForReview,
  getMyNoteCommunityReports,
  respondToNoteCommunityReport,
  reviewNoteCommunityReport,
} from "../controllers/note-community.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const noteRouter = Router();
const receiveNoteFile = receiveMultipart({
  fields: ["file"],
  maxFileSize: 10 * 1024 * 1024,
  single: true,
});

noteRouter.get(
  "/reports/review",
  requireAuth,
  requireRole("admin"),
  getCommunityReportsForReview,
);
noteRouter.patch(
  "/reports/:reportId/review",
  requireAuth,
  requireRole("admin"),
  reviewNoteCommunityReport,
);
noteRouter.get(
  "/reports",
  requireAuth,
  requireRole("user"),
  getMyNoteCommunityReports,
);
noteRouter.post(
  "/:noteId/reports",
  requireAuth,
  requireRole("user"),
  createNoteCommunityReport,
);
noteRouter.post(
  "/reports/:reportId/response",
  requireAuth,
  requireRole("user"),
  respondToNoteCommunityReport,
);

noteRouter.use(requireAuth, requireRole("user"));
noteRouter.get("/published", getPublishedNotes);
noteRouter.get("/", getMyNotes);
noteRouter.post("/", receiveNoteFile, createNote);
noteRouter.post("/:noteId/resubmissions", receiveNoteFile, resubmitCorrectedNote);
noteRouter.get("/:noteId/ocr", getMyNoteOcr);
noteRouter.get("/:noteId/verification", getMyNoteVerification);
noteRouter.delete("/:noteId", deleteMyNote);

export default noteRouter;
