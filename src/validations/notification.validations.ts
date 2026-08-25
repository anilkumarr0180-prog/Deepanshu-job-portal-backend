import { z } from "zod";
import { NOTIFICATION_TYPES } from "../constants/notification-type";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const notificationIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, "Invalid notification ID format."),
  }),
});

export const getNotificationsQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/, "Page must be a positive integer.").optional(),
    limit: z.string().regex(/^\d+$/, "Limit must be a positive integer.").optional(),
    type: z.enum(Object.values(NOTIFICATION_TYPES) as [string, ...string[]]).optional(),
    isRead: z.enum(["true", "false"]).optional(),
  }),
});
