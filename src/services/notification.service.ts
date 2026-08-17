import { Types } from "mongoose";
import Notification, { INotification } from "../models/notification.model";
import { NotificationType } from "../constants/notification-type";
import { emitNotificationToUser } from "../config/socket";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { getPaginationOptions, buildPaginatedResult } from "../utils/pagination";

export interface CreateNotificationInput {
  recipientId: string | Types.ObjectId;
  senderId?: string | Types.ObjectId | null;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationFilterOptions {
  page?: string;
  limit?: string;
  type?: NotificationType;
  isRead?: string | boolean;
}

/*
|--------------------------------------------------------------------------
| Create & Send Real-Time Notification
|--------------------------------------------------------------------------
*/
export const createNotification = async (
  input: CreateNotificationInput
): Promise<INotification> => {
  const notification = await Notification.create({
    recipientId: input.recipientId,
    senderId: input.senderId || null,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link || "",
    metadata: input.metadata || {},
    isRead: false,
  });

  // Calculate updated unread count for the recipient
  const unreadCount = await Notification.countDocuments({
    recipientId: input.recipientId,
    isRead: false,
  });

  // Push real-time Socket.io event to user room
  emitNotificationToUser(input.recipientId.toString(), notification.toJSON(), unreadCount);

  return notification;
};

/*
|--------------------------------------------------------------------------
| Get User Notifications Feed (Paginated)
|--------------------------------------------------------------------------
*/
export const getUserNotifications = async (
  recipientId: string,
  options: NotificationFilterOptions = {}
) => {
  const query: Record<string, unknown> = {
    recipientId,
  };

  if (options.type) {
    query.type = options.type;
  }

  if (options.isRead !== undefined && options.isRead !== "") {
    query.isRead = String(options.isRead) === "true";
  }

  const { page, limit, skip } = getPaginationOptions(options);

  const [items, totalItems, unreadCount] = await Promise.all([
    Notification.find(query)
      .populate("senderId", "name email profilePicture")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Notification.countDocuments(query),
    Notification.countDocuments({ recipientId, isRead: false }),
  ]);

  const formattedItems = items.map((doc) => ({
    id: doc._id.toString(),
    _id: doc._id.toString(),
    recipientId: doc.recipientId?.toString(),
    recipient_id: doc.recipientId?.toString(),
    senderId: doc.senderId,
    sender_id: doc.senderId,
    type: doc.type,
    title: doc.title,
    body: doc.body,
    link: doc.link,
    isRead: doc.isRead,
    is_read: doc.isRead,
    metadata: doc.metadata,
    createdAt: doc.createdAt,
    created_at: doc.createdAt,
  }));

  const paginatedResult = buildPaginatedResult(formattedItems, totalItems, page, limit);

  return {
    ...paginatedResult,
    unreadCount,
  };
};

/*
|--------------------------------------------------------------------------
| Get Unread Notification Count
|--------------------------------------------------------------------------
*/
export const getUnreadCount = async (recipientId: string): Promise<number> => {
  return await Notification.countDocuments({
    recipientId,
    isRead: false,
  });
};

/*
|--------------------------------------------------------------------------
| Mark Notification as Read
|--------------------------------------------------------------------------
*/
export const markAsRead = async (
  notificationId: string,
  recipientId: string
): Promise<INotification> => {
  const notification = await Notification.findOne({
    _id: notificationId,
    recipientId,
  });

  if (!notification) {
    throw new AppError(
      "Notification not found or unauthorized.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  if (!notification.isRead) {
    notification.isRead = true;
    await notification.save();

    const unreadCount = await getUnreadCount(recipientId);
    emitNotificationToUser(
      recipientId,
      {
        event: "read_single",
        id: notificationId,
        _id: notificationId,
        isRead: true,
        is_read: true,
      },
      unreadCount
    );
  }

  return notification;
};

/*
|--------------------------------------------------------------------------
| Mark All Notifications as Read
|--------------------------------------------------------------------------
*/
export const markAllAsRead = async (recipientId: string): Promise<{ modifiedCount: number }> => {
  const result = await Notification.updateMany(
    { recipientId, isRead: false },
    { $set: { isRead: true } }
  );

  emitNotificationToUser(recipientId, { event: "read_all" }, 0);

  return { modifiedCount: result.modifiedCount };
};

/*
|--------------------------------------------------------------------------
| Delete Single Notification
|--------------------------------------------------------------------------
*/
export const deleteNotification = async (
  notificationId: string,
  recipientId: string
): Promise<void> => {
  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    recipientId,
  });

  if (!notification) {
    throw new AppError(
      "Notification not found or unauthorized.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  const unreadCount = await getUnreadCount(recipientId);
  emitNotificationToUser(recipientId, { event: "delete", id: notificationId }, unreadCount);
};

/*
|--------------------------------------------------------------------------
| Clear All Read Notifications
|--------------------------------------------------------------------------
*/
export const clearAllRead = async (recipientId: string): Promise<{ deletedCount: number }> => {
  const result = await Notification.deleteMany({
    recipientId,
    isRead: true,
  });

  const unreadCount = await getUnreadCount(recipientId);
  emitNotificationToUser(recipientId, { event: "clear_read" }, unreadCount);

  return { deletedCount: result.deletedCount };
};
