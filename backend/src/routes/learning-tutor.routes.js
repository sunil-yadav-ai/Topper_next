import { Router } from "../lib/router.js";
import rateLimit from "../middleware/rate-limit.js";
import {
  answerLearningTutorQuestion,
  endLearningTutorSession,
  explainLearningTutorQuestion,
  getLearningTutorHistory,
  hintLearningTutorQuestion,
  nextLearningTutorQuestion,
  startLearningTutor,
} from "../controllers/learning-tutor.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const learningTutorRouter = Router();
const tutorRequestLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many AI tutor requests. Please wait a moment and try again.",
  },
});

learningTutorRouter.use(requireAuth, requireRole("user"));
learningTutorRouter.get("/notes/:noteId", getLearningTutorHistory);
learningTutorRouter.post("/notes/:noteId/start", tutorRequestLimit, startLearningTutor);
learningTutorRouter.post("/sessions/:sessionId/answer", tutorRequestLimit, answerLearningTutorQuestion);
learningTutorRouter.post("/sessions/:sessionId/hint", tutorRequestLimit, hintLearningTutorQuestion);
learningTutorRouter.post("/sessions/:sessionId/explain", tutorRequestLimit, explainLearningTutorQuestion);
learningTutorRouter.post("/sessions/:sessionId/next", tutorRequestLimit, nextLearningTutorQuestion);
learningTutorRouter.post("/sessions/:sessionId/end", tutorRequestLimit, endLearningTutorSession);

export default learningTutorRouter;
