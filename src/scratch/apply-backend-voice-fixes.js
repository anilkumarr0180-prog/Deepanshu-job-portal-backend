const fs = require('fs');
const path = require('path');

const serverSrc = path.resolve(__dirname, '..');

// 1. Update chat.validations.ts
const chatValidationsPath = path.join(serverSrc, 'validations/chat.validations.ts');
const newChatValidations = `import { z } from "zod";

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

export const ALLOWED_VOICE_MIME_TYPES = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-m4a",
  "audio/aac",
];

export const MAX_VOICE_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export const sendMessageSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, "Invalid conversation ID format."),
  }),
  body: z
    .object({
      message: z
        .string()
        .trim()
        .max(5000, "Message content exceeds limit of 5000 characters.")
        .optional()
        .default(""),
      messageType: z.enum(["text", "image", "file", "system", "voice"]).optional().default("text"),
      attachments: z
        .array(
          z.object({
            url: z.string().url("Attachment must have a valid URL."),
            name: z.string().optional(),
            size: z.number().optional(),
            mimeType: z.string().optional(),
          })
        )
        .optional()
        .default([]),
    })
    .superRefine((data, ctx) => {
      // 1. If text message, message must not be empty
      if (data.messageType === "text" && (!data.message || !data.message.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Message content cannot be empty for text messages.",
          path: ["message"],
        });
      }

      // 2. If voice message, require valid audio attachment
      if (data.messageType === "voice") {
        if (!data.attachments || data.attachments.length === 0) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Voice messages require an audio attachment.",
            path: ["attachments"],
          });
          return;
        }

        const voiceAtt = data.attachments[0];
        if (!voiceAtt.url || !/^https?:\/\//i.test(voiceAtt.url)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Voice message must have a valid audio URL.",
            path: ["attachments", 0, "url"],
          });
        }

        if (voiceAtt.mimeType) {
          const rawMime = voiceAtt.mimeType.toLowerCase();
          const baseMime = rawMime.split(";")[0].trim();
          const isAllowed =
            baseMime.startsWith("audio/") ||
            ALLOWED_VOICE_MIME_TYPES.some((allowed) =>
              rawMime.startsWith(allowed.toLowerCase().split(";")[0])
            );

          if (!isAllowed) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: \`Invalid audio MIME type: \${voiceAtt.mimeType}. Allowed formats: webm, mp4, ogg, mp3, wav.\`,
              path: ["attachments", 0, "mimeType"],
            });
          }
        }

        if (voiceAtt.size !== undefined && voiceAtt.size > MAX_VOICE_FILE_SIZE) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Voice message exceeds maximum limit of 5MB.",
            path: ["attachments", 0, "size"],
          });
        }
      }
    }),
});

export const getConversationsQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\\d+$/, "Page must be a positive integer.").optional(),
    limit: z.string().regex(/^\\d+$/, "Limit must be a positive integer.").optional(),
  }),
});
`;
fs.writeFileSync(chatValidationsPath, newChatValidations);
console.log('✅ Overwrote validations/chat.validations.ts');

// 2. Ensure chat.service.ts createMessage handles empty fallback correctly
const chatServicePath = path.join(serverSrc, 'services/chat.service.ts');
let chatService = fs.readFileSync(chatServicePath, 'utf8');

// Replace createMessage header
const oldCreateMessage = `export const createMessage = async (
  conversationId: string,
  senderId: string,
  messageText: string,
  messageType: MessageType = "text",
  attachments: IMessageAttachment[] = []
): Promise<IMessage> => {
  if (!messageText || !messageText.trim()) {
    throw new AppError("Message content cannot be empty.", HTTP_STATUS.BAD_REQUEST);
  }

  if (messageText.length > 5000) {
    throw new AppError("Message content exceeds limit of 5000 characters.", HTTP_STATUS.BAD_REQUEST);
  }`;

const newCreateMessage = `export const createMessage = async (
  conversationId: string,
  senderId: string,
  messageText: string = "",
  messageType: MessageType = "text",
  attachments: IMessageAttachment[] = []
): Promise<IMessage> => {
  let content = (messageText || "").trim();

  // If voice message, provide safe fallback text if empty
  if (messageType === "voice") {
    if (!attachments || attachments.length === 0 || !attachments[0]?.url) {
      throw new AppError("Voice messages require an audio attachment.", HTTP_STATUS.BAD_REQUEST);
    }
    if (!content) {
      content = "🎤 Voice message";
    }
  }

  if (!content) {
    throw new AppError("Message content cannot be empty.", HTTP_STATUS.BAD_REQUEST);
  }

  if (content.length > 5000) {
    throw new AppError("Message content exceeds limit of 5000 characters.", HTTP_STATUS.BAD_REQUEST);
  }`;

if (chatService.includes(oldCreateMessage)) {
  chatService = chatService.replace(oldCreateMessage, newCreateMessage);
  fs.writeFileSync(chatServicePath, chatService);
  console.log('✅ Updated services/chat.service.ts createMessage');
}
