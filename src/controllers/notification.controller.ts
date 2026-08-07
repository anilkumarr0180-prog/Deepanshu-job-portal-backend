import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as notificationService from "../services/notification.service";
import { asyncHandler } from "../middleware/async-handler";

/*
|--------------------------------------------------------------------------
| Get Notifications Feed
|--------------------------------------------------------------------------
*/
export const getUserNotifications = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const result = await notificationService.getUserNotifications(
      userId,
      req.query
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get Unread Notification Count
|--------------------------------------------------------------------------
*/
export const getUnreadCount = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const unreadCount = await notificationService.getUnreadCount(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { unreadCount },
    });
  }
);

/*
|--------------------------------------------------------------------------
| Mark Single Notification as Read
|--------------------------------------------------------------------------
*/
export const markAsRead = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const id = req.params.id as string;

    const notification = await notificationService.markAsRead(id, userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Notification marked as read.",
      data: notification,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Mark All Notifications as Read
|--------------------------------------------------------------------------
*/
export const markAllAsRead = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const result = await notificationService.markAllAsRead(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "All notifications marked as read.",
      data: result,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Delete Single Notification
|--------------------------------------------------------------------------
*/
export const deleteNotification = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const id = req.params.id as string;

    await notificationService.deleteNotification(id, userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Notification deleted successfully.",
    });
  }
);

/*
|--------------------------------------------------------------------------
| Clear All Read Notifications
|--------------------------------------------------------------------------
*/
export const clearAllRead = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const result = await notificationService.clearAllRead(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Cleared all read notifications.",
      data: result,
    });
  }
);
