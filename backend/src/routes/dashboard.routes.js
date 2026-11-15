import { Router } from "../lib/router.js";
import {
  getStudentDashboard,
  saveStudentResource,
  unsaveStudentResource,
  updateStudentProfile,
} from "../controllers/dashboard.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";

const dashboardRouter = Router();

dashboardRouter.use(requireAuth, requireRole("user"));
dashboardRouter.get("/", getStudentDashboard);
dashboardRouter.patch("/profile", updateStudentProfile);
dashboardRouter.post("/saved-resources/:resourceId", saveStudentResource);
dashboardRouter.delete("/saved-resources/:resourceId", unsaveStudentResource);

export default dashboardRouter;
