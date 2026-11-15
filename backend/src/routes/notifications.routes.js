import { Router } from "../lib/router.js";
import {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../controllers/notifications.controller.js";
import { requireAuth } from "../middleware/auth.middleware.js";

const notificationsRouter = Router();

notificationsRouter.use(requireAuth);
notificationsRouter.get("/", listNotifications);
notificationsRouter.patch("/read-all", markAllNotificationsRead);
notificationsRouter.patch("/:notificationId/read", markNotificationRead);
notificationsRouter.delete("/:notificationId", deleteNotification);

export default notificationsRouter;
