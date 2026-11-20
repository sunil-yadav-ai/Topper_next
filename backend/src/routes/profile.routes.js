import { Router } from "../lib/router.js";
import {
  getPublicProfile,
  searchPublicProfiles,
  updateOwnProfile,
} from "../controllers/profile.controller.js";
import {
  optionalAuth,
  requireAuth,
  requireRole,
} from "../middleware/auth.middleware.js";
import { receiveMultipart } from "../middleware/next-upload.js";
import {
  followUser,
  listFollowers,
  listFollowing,
  unfollowUser,
} from "../controllers/follow.controller.js";

const profileRouter = Router();
const receiveProfileImages = receiveMultipart({
  fields: { avatar: 1, cover: 1 },
  maxFileSize: 8 * 1024 * 1024,
  maxFiles: 2,
});

profileRouter.get("/search", optionalAuth, searchPublicProfiles);
profileRouter.get("/:username", optionalAuth, getPublicProfile);
profileRouter.patch("/me", requireAuth, receiveProfileImages, updateOwnProfile);
profileRouter.post("/:username/follow", requireAuth, requireRole("user"), followUser);
profileRouter.delete("/:username/follow", requireAuth, requireRole("user"), unfollowUser);
profileRouter.get(
  "/:username/followers",
  listFollowers,
);
profileRouter.get(
  "/:username/following",
  listFollowing,
);

export default profileRouter;
