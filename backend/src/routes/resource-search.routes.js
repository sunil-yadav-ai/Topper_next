import { Router } from "../lib/router.js";
import {
  getResourceSearchOptionsCollection,
  getResourceViewInfo,
  markSearchResultHelpful,
  searchResourceCollection,
  suggestResourceCollection,
  viewNotePreview,
  viewResource,
} from "../controllers/resource-search.controller.js";
import {
  optionalAuth,
  requireAuth,
  requireRole,
} from "../middleware/auth.middleware.js";

const resourceSearchRouter = Router();

resourceSearchRouter.get("/", optionalAuth, searchResourceCollection);
resourceSearchRouter.get("/options", getResourceSearchOptionsCollection);
resourceSearchRouter.get("/suggestions", suggestResourceCollection);
resourceSearchRouter.get(
  "/resources/note/:resourceId/preview",
  optionalAuth,
  viewNotePreview,
);
resourceSearchRouter.get(
  "/resources/:resourceType/:resourceId/view-info",
  requireAuth,
  requireRole("user", "admin"),
  getResourceViewInfo,
);
resourceSearchRouter.get(
  "/resources/:resourceType/:resourceId/view",
  requireAuth,
  requireRole("user", "admin"),
  viewResource,
);
resourceSearchRouter.post(
  "/:resourceType/:resourceId/helpful",
  requireAuth,
  requireRole("user"),
  markSearchResultHelpful,
);

export default resourceSearchRouter;
