import { Router } from "express";
import {
  getIceServersController,
  getCallHistoryController,
  getConversationCallHistoryController,
  getUnreadMissedCallsCountController,
  markMissedCallsReadController,
} from "../controllers/call.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import {
  getCallHistoryQuerySchema,
  conversationCallsParamSchema,
  markMissedCallsReadSchema,
} from "../validations/call.validations";

const router = Router();

// Protect all calling API endpoints with JWT Authentication
router.use(authMiddleware);

/*
|--------------------------------------------------------------------------
| Calling REST Routes
|--------------------------------------------------------------------------
*/

router.get("/ice-servers", getIceServersController);
router.get("/history", validate(getCallHistoryQuerySchema), getCallHistoryController);
router.get(
  "/conversation/:conversationId",
  validate(conversationCallsParamSchema),
  validate(getCallHistoryQuerySchema),
  getConversationCallHistoryController
);
router.get("/missed/unread-count", getUnreadMissedCallsCountController);
router.patch("/missed/read", validate(markMissedCallsReadSchema), markMissedCallsReadController);

export default router;
