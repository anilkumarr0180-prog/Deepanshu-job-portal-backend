import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const conversationIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, "Invalid conversation ID format."),
  }),
});

export const messageIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, "Invalid message ID format."),
  }),
});

export const createConversationSchema = z.object({
  body: z
    .object({
      jobId: z.string().regex(objectIdRegex, "Invalid Job ID format.").optional(),
      targetUserId: z.string().regex(objectIdRegex, "Invalid Target User ID format.").optional(),
    })
    .refine((data) => data.jobId !== undefined || data.targetUserId !== undefined, {
      message: "Job ID or Target User ID is required to start a conversation.",
    }),
});

export const sendMessageSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, "Invalid conversation ID format."),
  }),
  body: z.object({
    message: z
      .string()
      .trim()
      .min(1, "Message content cannot be empty.")
      .max(5000, "Message content exceeds limit of 5000 characters."),
    messageType: z.enum(["text", "image", "file", "system"]).optional(),
    attachments: z
      .array(
        z.object({
          url: z.string().url("Attachment must have a valid URL."),
          name: z.string().optional(),
          size: z.number().optional(),
          mimeType: z.string().optional(),
        })
      )
      .optional(),
  }),
});

export const getConversationsQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/, "Page must be a positive integer.").optional(),
    limit: z.string().regex(/^\d+$/, "Limit must be a positive integer.").optional(),
  }),
});
