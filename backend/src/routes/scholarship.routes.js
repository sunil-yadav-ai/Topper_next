import { Router } from "../lib/router.js";
import { optionalAuth, requireAuth, requireRole } from "../middleware/auth.middleware.js";
import {
  checkScholarshipEligibility,
  getCategories,
  getFeatured,
  getSavedScholarships,
  getScholarship,
  getScholarshipEligibilityProfile,
  getScholarshipProfile,
  getSourceStats,
  listApplications,
  listScholarships,
  postScholarshipProfile,
  putScholarshipProfile,
  saveScholarship,
  createApplication,
  updateApplication,
  runDiscovery,
} from "../controllers/scholarship.controller.js";

const scholarshipRouter = Router();

scholarshipRouter.get("/", optionalAuth, listScholarships);
scholarshipRouter.get("/categories", optionalAuth, getCategories);
scholarshipRouter.get("/featured", optionalAuth, getFeatured);
scholarshipRouter.get("/sources", optionalAuth, getSourceStats);
scholarshipRouter.post("/discover", requireAuth, requireRole("admin"), runDiscovery);
scholarshipRouter.get("/saved", requireAuth, getSavedScholarships);
scholarshipRouter.post("/save", requireAuth, saveScholarship);
scholarshipRouter.get("/profile/eligibility/:scholarshipId", requireAuth, requireRole("user"), getScholarshipEligibilityProfile);
scholarshipRouter.get("/profile", requireAuth, requireRole("user"), getScholarshipProfile);
scholarshipRouter.post("/profile", requireAuth, requireRole("user"), postScholarshipProfile);
scholarshipRouter.put("/profile", requireAuth, requireRole("user"), putScholarshipProfile);
scholarshipRouter.post("/check-eligibility", requireAuth, requireRole("user"), checkScholarshipEligibility);
scholarshipRouter.get("/applications", requireAuth, listApplications);
scholarshipRouter.post("/applications", requireAuth, createApplication);
scholarshipRouter.put("/applications/:id", requireAuth, updateApplication);
scholarshipRouter.get("/:slug", optionalAuth, getScholarship);

export default scholarshipRouter;
