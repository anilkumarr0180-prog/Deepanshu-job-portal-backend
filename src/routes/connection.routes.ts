import { Router } from "express";
import {
  sendConnectionRequest,
  acceptConnection,
  rejectConnection,
  cancelConnectionRequest,
  removeConnection,
  getUserConnections,
  getConnectionStatus,
  getConnectionCount,
  getPeopleSuggestions,
  searchUsers,
} from "../controllers/connection.controller";
import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import {
  sendConnectionRequestSchema,
  connectionIdParamSchema,
  targetUserIdParamSchema,
  getConnectionsQuerySchema,
  searchUsersQuerySchema,
} from "../validations/connection.validations";

const router = Router();

router.get(
  "/suggestions",
  authMiddleware,
  getPeopleSuggestions
);

router.get(
  "/search",
  authMiddleware,
  validate(searchUsersQuerySchema),
  searchUsers
);

router.get(
  "/status/:targetUserId",
  authMiddleware,
  validate(targetUserIdParamSchema),
  getConnectionStatus
);

router.get(
  "/count/:userId",
  optionalAuthMiddleware,
  getConnectionCount
);

router.get(
  "/",
  authMiddleware,
  validate(getConnectionsQuerySchema),
  getUserConnections
);

router.post(
  "/request/:recipientId",
  authMiddleware,
  validate(sendConnectionRequestSchema),
  sendConnectionRequest
);

router.put(
  "/:id/accept",
  authMiddleware,
  validate(connectionIdParamSchema),
  acceptConnection
);

router.put(
  "/:id/reject",
  authMiddleware,
  validate(connectionIdParamSchema),
  rejectConnection
);

router.delete(
  "/:id/cancel",
  authMiddleware,
  validate(connectionIdParamSchema),
  cancelConnectionRequest
);

router.delete(
  "/:id",
  authMiddleware,
  validate(connectionIdParamSchema),
  removeConnection
);

export default router;
