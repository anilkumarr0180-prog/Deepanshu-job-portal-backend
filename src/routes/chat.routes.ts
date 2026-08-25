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
import { validate } from "../middleware/validation.middleware";
import {
  createConversationSchema,
  sendMessageSchema,
  conversationIdParamSchema,
  messageIdParamSchema,
  getConversationsQuerySchema,
} from "../validations/chat.validations";

const router = Router();

// Protect all chat routes with JWT Authentication
router.use(authMiddleware);

/*
|--------------------------------------------------------------------------
| Chat REST Routes
|--------------------------------------------------------------------------
*/

router.get("/conversations", validate(getConversationsQuerySchema), getUserConversationsController);
router.post("/conversations", validate(createConversationSchema), createOrGetConversationController);
router.get("/conversations/:id/messages", validate(conversationIdParamSchema), validate(getConversationsQuerySchema), getConversationMessagesController);
router.post("/conversations/:id/messages", validate(sendMessageSchema), sendMessageController);
router.patch("/conversations/:id/read", validate(conversationIdParamSchema), markConversationReadController);
router.patch("/messages/:id/read", validate(messageIdParamSchema), markMessageReadController);
router.get("/unread-count", getUnreadCountController);

export default router;
