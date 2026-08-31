import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const callIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, "Invalid call ID format."),
  }),
});

export const conversationCallsParamSchema = z.object({
  params: z.object({
    conversationId: z.string().regex(objectIdRegex, "Invalid conversation ID format."),
  }),
});

export const getCallHistoryQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/, "Page must be a positive integer.").optional(),
    limit: z.string().regex(/^\d+$/, "Limit must be a positive integer.").optional(),
    conversationId: z.string().regex(objectIdRegex, "Invalid conversation ID format.").optional(),
    status: z
      .enum([
        "ringing",
        "accepted",
        "ended",
        "cancelled",
        "declined",
        "busy",
        "missed",
        "failed",
      ])
      .optional(),
  }),
});

export const markMissedCallsReadSchema = z.object({
  body: z
    .object({
      conversationId: z
        .string()
        .regex(objectIdRegex, "Invalid conversation ID format.")
        .optional(),
    })
    .optional(),
});
