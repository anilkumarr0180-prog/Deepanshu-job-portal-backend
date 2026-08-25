import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const createReportSchema = z.object({
  body: z.object({
    targetType: z.enum(["post", "comment", "user"]),
    targetId: z.string().regex(objectIdRegex, "Invalid target entity ID"),
    reason: z.enum([
      "spam",
      "harassment",
      "inappropriate",
      "hate_speech",
      "misinformation",
      "impersonation",
      "other",
    ]),
    description: z.string().max(1000, "Description cannot exceed 1000 characters").optional(),
  }),
});
