import { Request, Response, NextFunction } from "express";
import { getIceServersConfig } from "../services/turn.service";
import * as callService from "../services/call.service";
import { asyncHandler } from "../middleware/async-handler";
import { HTTP_STATUS } from "../constants/http-status";

/**
 * Controller to fetch time-limited STUN/TURN ICE server configuration
 */
export const getIceServersController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: "Authentication required to fetch ICE server configuration.",
      });
      return;
    }

    const iceConfig = getIceServersConfig(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "ICE server configuration retrieved successfully.",
      data: iceConfig,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get paginated call history for authenticated user
 */
export const getCallHistoryController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user?.userId;
    const result = await callService.getUserCallHistory(userId, req.query);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Call history fetched successfully.",
      data: result,
    });
  }
);

/**
 * Get paginated call history for a specific conversation
 */
export const getConversationCallHistoryController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user?.userId;
    const conversationId = req.params.conversationId as string;

    const result = await callService.getConversationCallHistory(
      conversationId,
      userId,
      req.query
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Conversation call history fetched successfully.",
      data: result,
    });
  }
);

/**
 * Get total unread missed calls count for authenticated user
 */
export const getUnreadMissedCallsCountController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user?.userId;
    const unreadCount = await callService.getUnreadMissedCallsCount(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Unread missed calls count fetched successfully.",
      data: { unreadCount },
    });
  }
);

import { getIO } from "../config/socket";

/**
 * Mark missed calls as read for authenticated user (optionally scoped to a conversation)
 */
export const markMissedCallsReadController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = (req as any).user?.userId;
    const conversationId = req.body?.conversationId;

    const result = await callService.markMissedCallsAsRead(userId, conversationId);

    // Realtime sync across all open tabs of this user
    try {
      const io = getIO();
      const unreadMissedCallCount = await callService.getUnreadMissedCallsCount(userId);
      io.to(`user_${userId}`).emit("call:missed_count_updated", {
        unreadMissedCallCount,
      });
    } catch {
      // ignore if socket server is not initialized in isolated tests
    }

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Missed calls marked as read.",
      data: result,
    });
  }
);
