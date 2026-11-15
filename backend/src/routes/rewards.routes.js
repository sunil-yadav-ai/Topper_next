import { Router } from "../lib/router.js";
import {
  adjustStudentRewards,
  awardHighQualityResource,
  getAdminRewardsOverview,
  getMyRewards,
  getRewardsLeaderboard,
} from "../controllers/rewards.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const rewardsRouter = Router();

rewardsRouter.get(
  "/me",
  requireAuth,
  requireRole("user"),
  getMyRewards,
);
rewardsRouter.get(
  "/leaderboard",
  requireAuth,
  requireRole("user"),
  getRewardsLeaderboard,
);
rewardsRouter.get(
  "/admin/overview",
  requireAuth,
  requireRole("admin"),
  getAdminRewardsOverview,
);
rewardsRouter.post(
  "/admin/adjust",
  requireAuth,
  requireRole("admin"),
  adjustStudentRewards,
);
rewardsRouter.post(
  "/admin/quality-bonus",
  requireAuth,
  requireRole("admin"),
  awardHighQualityResource,
);

export default rewardsRouter;
