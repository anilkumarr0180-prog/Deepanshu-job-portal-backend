import { Router } from "express";
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  clearAllRead,
} from "../controllers/notification.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import {
  notificationIdParamSchema,
  getNotificationsQuerySchema,
} from "../validations/notification.validations";

const router = Router();

// All notification routes require user authentication
router.use(authMiddleware);

router.get("/", validate(getNotificationsQuerySchema), getUserNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllAsRead);
router.delete("/clear-all", clearAllRead);
router.patch("/:id/read", validate(notificationIdParamSchema), markAsRead);
router.delete("/:id", validate(notificationIdParamSchema), deleteNotification);

export default router;
