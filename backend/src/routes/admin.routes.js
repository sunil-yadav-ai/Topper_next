import { Router } from "../lib/router.js";
import {
  getAdminOverview,
  listAdminNotes,
  listAdminPyqReports,
  listAdminStudents,
  reviewAdminPyqReport,
  setStudentSuspension,
} from "../controllers/admin.controller.js";
import { requireAuth, requireRole } from "../middleware/auth.middleware.js";
import { sendAdminAnnouncement } from "../controllers/notifications.controller.js";

const adminRouter = Router();

adminRouter.use(requireAuth, requireRole("admin"));
adminRouter.post("/announcements", sendAdminAnnouncement);
adminRouter.get("/overview", getAdminOverview);
adminRouter.get("/notes", listAdminNotes);
adminRouter.get("/students", listAdminStudents);
adminRouter.patch("/students/:studentId/suspension", setStudentSuspension);
adminRouter.get("/pyq-reports", listAdminPyqReports);
adminRouter.patch("/pyq-reports/:reportId", reviewAdminPyqReport);

export default adminRouter;
