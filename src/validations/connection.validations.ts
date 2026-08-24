import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const sendConnectionRequestSchema = z.object({
  params: z.object({
    recipientId: z.string().regex(objectIdRegex, "Invalid recipient user ID format."),
  }),
});

export const connectionIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, "Invalid connection ID format."),
  }),
});

export const targetUserIdParamSchema = z.object({
  params: z.object({
    targetUserId: z.string().regex(objectIdRegex, "Invalid target user ID format."),
  }),
});

export const getConnectionsQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/, "Page must be a positive integer.").optional(),
    limit: z.string().regex(/^\d+$/, "Limit must be a positive integer.").optional(),
    status: z.enum(["accepted", "pending", "sent", "all"]).optional(),
    search: z.string().trim().optional(),
  }),
});

export const searchUsersQuerySchema = z.object({
  query: z.object({
    q: z.string().trim().min(1, "Search query is required."),
    page: z.string().regex(/^\d+$/, "Page must be a positive integer.").optional(),
    limit: z.string().regex(/^\d+$/, "Limit must be a positive integer.").optional(),
  }),
});
