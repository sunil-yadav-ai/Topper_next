import { Router } from "../lib/router.js";
import rateLimit from "../middleware/rate-limit.js";
import {
  answerAiPracticeQuestion,
  endAiPractice,
  explainAiPracticeQuestion,
  getAiPracticeHistory,
  getAiPracticeOptions,
  hintAiPracticeQuestion,
  nextAiPracticeQuestion,
  startAiPractice,
  timeoutAiPracticeQuestion,
} from "../controllers/ai-practice.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const aiPracticeRouter = Router();
const practiceRequestLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: "error", message: "Too many AI Practice requests. Please wait a moment and try again." },
});

aiPracticeRouter.use(requireAuth, requireRole("user"));
aiPracticeRouter.get("/options", getAiPracticeOptions);
aiPracticeRouter.get("/history", getAiPracticeHistory);
aiPracticeRouter.post("/sessions", practiceRequestLimit, startAiPractice);
aiPracticeRouter.post("/sessions/:sessionId/answer", practiceRequestLimit, answerAiPracticeQuestion);
aiPracticeRouter.post("/sessions/:sessionId/timeout", practiceRequestLimit, timeoutAiPracticeQuestion);
aiPracticeRouter.post("/sessions/:sessionId/hint", practiceRequestLimit, hintAiPracticeQuestion);
aiPracticeRouter.post("/sessions/:sessionId/explain", practiceRequestLimit, explainAiPracticeQuestion);
aiPracticeRouter.post("/sessions/:sessionId/next", practiceRequestLimit, nextAiPracticeQuestion);
aiPracticeRouter.post("/sessions/:sessionId/end", practiceRequestLimit, endAiPractice);

export default aiPracticeRouter;
