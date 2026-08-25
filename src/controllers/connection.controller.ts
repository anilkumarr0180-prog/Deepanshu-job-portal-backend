import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as connectionService from "../services/connection.service";
import { asyncHandler } from "../middleware/async-handler";

export const sendConnectionRequest = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const requesterId = req.user!.userId;
    const recipientId = req.params.recipientId as string;

    const connection = await connectionService.sendConnectionRequest(
      requesterId,
      recipientId
    );

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Connection request sent successfully.",
      data: connection,
    });
  }
);

export const acceptConnection = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const connectionId = req.params.id as string;

    const connection = await connectionService.acceptConnection(
      connectionId,
      userId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Connection request accepted.",
      data: connection,
    });
  }
);

export const rejectConnection = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const connectionId = req.params.id as string;

    const connection = await connectionService.rejectConnection(
      connectionId,
      userId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Connection request declined.",
      data: connection,
    });
  }
);

export const cancelConnectionRequest = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const connectionId = req.params.id as string;

    const result = await connectionService.cancelConnectionRequest(
      connectionId,
      userId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
    });
  }
);

export const removeConnection = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const connectionId = req.params.id as string;

    const result = await connectionService.removeConnection(
      connectionId,
      userId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
    });
  }
);

export const getUserConnections = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const connections = await connectionService.getUserConnections(
      userId,
      req.query
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Connections fetched successfully.",
      data: connections,
    });
  }
);

export const getConnectionStatus = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const targetUserId = req.params.targetUserId as string;

    const status = await connectionService.getConnectionStatus(
      userId,
      targetUserId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: status,
    });
  }
);

export const getConnectionCount = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const targetUserId = (req.params.userId as string) || req.user?.userId;
    if (!targetUserId) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: "User ID required." });
      return;
    }

    const count = await connectionService.getConnectionCount(targetUserId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { count },
    });
  }
);

export const getPeopleSuggestions = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const limit = req.query.limit ? Number(req.query.limit) : 6;

    const suggestions = await connectionService.getPeopleSuggestions(
      userId,
      limit
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "People suggestions fetched successfully.",
      data: suggestions,
    });
  }
);

export const searchUsers = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const query = (req.query.q as string) || "";

    const results = await connectionService.searchUsers(
      userId,
      query,
      req.query
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Users search results fetched successfully.",
      data: results,
    });
  }
);
