import { Router } from "../lib/router.js";
import rateLimit from "../middleware/rate-limit.js";
import {
  getLearningActivity,
  recordLearningActivity,
} from "../controllers/learning-activity.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const learningActivityRouter = Router();
const recordActivityLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: "error",
    message: "Too many activity updates. Please wait and try again.",
  },
});

learningActivityRouter.post(
  "/open",
  requireAuth,
  requireRole("user"),
  recordActivityLimit,
  recordLearningActivity,
);
learningActivityRouter.get(
  "/profiles/:username",
  getLearningActivity,
);

export default learningActivityRouter;
