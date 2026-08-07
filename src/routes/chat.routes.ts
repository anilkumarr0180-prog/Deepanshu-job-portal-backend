import { Router } from "express";
import {
  createOrGetConversationController,
  getUserConversationsController,
  getConversationMessagesController,
  sendMessageController,
  markConversationReadController,
  markMessageReadController,
  getUnreadCountController,
} from "../controllers/chat.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// Protect all chat routes with JWT Authentication
router.use(authMiddleware);

/*
|--------------------------------------------------------------------------
| Chat REST Routes
|--------------------------------------------------------------------------
*/

router.get("/conversations", getUserConversationsController);
router.post("/conversations", createOrGetConversationController);
router.get("/conversations/:id/messages", getConversationMessagesController);
router.post("/conversations/:id/messages", sendMessageController);
router.patch("/conversations/:id/read", markConversationReadController);
router.patch("/messages/:id/read", markMessageReadController);
router.get("/unread-count", getUnreadCountController);

export default router;
