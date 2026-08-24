import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const postIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, "Invalid post ID format."),
  }),
});

export const createPostSchema = z.object({
  body: z.object({
    content: z
      .string()
      .trim()
      .min(1, "Post content is required.")
      .max(5000, "Post content cannot exceed 5000 characters."),
    mediaUrl: z.string().url("Invalid media URL format.").optional(),
    mediaPublicId: z.string().trim().min(1, "mediaPublicId cannot be empty if provided.").optional(),
  }),
});

export const repostPostSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, "Invalid post ID format."),
  }),
  body: z.object({
    content: z
      .string()
      .trim()
      .max(5000, "Commentary cannot exceed 5000 characters.")
      .optional()
      .default(""),
  }).optional(),
});

export const updatePostSchema = z.object({
  body: z
    .object({
      content: z
        .string()
        .trim()
        .min(1, "Post content cannot be empty.")
        .max(5000, "Post content cannot exceed 5000 characters.")
        .optional(),
      mediaUrl: z.string().url("Invalid media URL format.").nullable().optional(),
      mediaPublicId: z.string().trim().nullable().optional(),
    })
    .refine(
      (data) =>
        data.content !== undefined ||
        data.mediaUrl !== undefined ||
        data.mediaPublicId !== undefined,
      {
        message: "At least one field (content, mediaUrl, or mediaPublicId) must be provided for update.",
      }
    ),
});

export const getPostsQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/, "Page must be a positive integer.").optional(),
    limit: z.string().regex(/^\d+$/, "Limit must be a positive integer.").optional(),
    sort: z.enum(["newest", "oldest"]).optional(),
    feedType: z.enum(["for-you", "recent", "my-network"]).optional(),
    search: z.string().trim().optional(),
  }),
});

export const validatePostMedia = (
  mediaUrl?: string | null,
  mediaPublicId?: string | null
): { valid: boolean; error?: string } => {
  if (!mediaUrl && !mediaPublicId) {
    return { valid: true };
  }

  if (Boolean(mediaUrl) !== Boolean(mediaPublicId)) {
    return {
      valid: false,
      error: "Both mediaUrl and mediaPublicId must be provided together.",
    };
  }

  return { valid: true };
};
