import { Router } from "../lib/router.js";
import {
  getPublicProfile,
  searchPublicProfiles,
  updateOwnProfile,
} from "../controllers/profile.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { receiveMultipart } from "../middleware/next-upload.js";

const profileRouter = Router();
const receiveProfileImages = receiveMultipart({
  fields: { avatar: 1, cover: 1 },
  maxFileSize: 8 * 1024 * 1024,
  maxFiles: 2,
});

profileRouter.get("/search", searchPublicProfiles);
profileRouter.get("/:username", getPublicProfile);
profileRouter.patch("/me", requireAuth, receiveProfileImages, updateOwnProfile);

export default profileRouter;
