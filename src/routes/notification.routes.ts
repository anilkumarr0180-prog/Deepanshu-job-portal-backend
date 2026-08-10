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

const router = Router();

// All notification routes require user authentication
router.use(authMiddleware);

router.get("/", getUserNotifications);
router.get("/unread-count", getUnreadCount);
router.patch("/read-all", markAllAsRead);
router.delete("/clear-all", clearAllRead);
router.patch("/:id/read", markAsRead);
router.delete("/:id", deleteNotification);

export default router;
