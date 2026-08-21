import { z } from "zod";
import { Types } from "mongoose";
import { env } from "../config/env";
import { CLOUDINARY_FOLDERS } from "../constants/cloudinary";

/*
|--------------------------------------------------------------------------
| ObjectId Validation Helper
|--------------------------------------------------------------------------
*/
const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: "Invalid post ID format.",
});

/*
|--------------------------------------------------------------------------
| Post Media Cloudinary Validators
|--------------------------------------------------------------------------
*/
export const isCloudinaryPostMediaUrl = (url?: string | null): boolean => {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return false;
    if (parsed.hostname !== "res.cloudinary.com") return false;

    const cloudName = env.CLOUDINARY_CLOUD_NAME;
    if (!cloudName) return false;

    // Path must start with /<cloudName>/image/upload/
    const expectedPrefix = `/${cloudName}/image/upload/`;
    if (!parsed.pathname.startsWith(expectedPrefix)) return false;

    // Path must strictly contain canonical post namespace
    if (!parsed.pathname.includes(`/${CLOUDINARY_FOLDERS.post}/`)) return false;

    return true;
  } catch {
    return false;
  }
};

export const isCloudinaryPostPublicId = (publicId?: string | null): boolean => {
  if (!publicId || typeof publicId !== "string") return false;
  const trimmed = publicId.trim();
  if (!trimmed) return false;

  // Prevent directory traversal and enforce authorized canonical namespace
  if (trimmed.includes("..")) return false;

  const canonicalRegex = new RegExp(
    `^${CLOUDINARY_FOLDERS.post.replace("/", "\\/")}\\/[a-zA-Z0-9_\\-\\.\\/]+$`
  );

  return canonicalRegex.test(trimmed);
};

export const validatePostMedia = (
  mediaUrl?: string | null,
  mediaPublicId?: string | null
): { valid: boolean; error?: string } => {
  const cleanUrl = mediaUrl ? mediaUrl.trim() : "";
  const cleanId = mediaPublicId ? mediaPublicId.trim() : "";

  if (!cleanUrl && !cleanId) {
    return { valid: true };
  }

  if ((cleanUrl && !cleanId) || (!cleanUrl && cleanId)) {
    return {
      valid: false,
      error: "Both mediaUrl and mediaPublicId must be provided together.",
    };
  }

  if (!isCloudinaryPostMediaUrl(cleanUrl)) {
    return {
      valid: false,
      error: `Invalid post media URL. Must be an HTTPS Cloudinary URL from the authorized cloud and folder (${CLOUDINARY_FOLDERS.post}).`,
    };
  }

  if (!isCloudinaryPostPublicId(cleanId)) {
    return {
      valid: false,
      error: `Invalid post media public ID. Must be located within '${CLOUDINARY_FOLDERS.post}/'.`,
    };
  }

  const idWithoutExt = cleanId.replace(/\.[^/.]+$/, "");
  if (!cleanUrl.includes(idWithoutExt)) {
    return {
      valid: false,
      error: "Post media URL and public ID do not match the same asset.",
    };
  }

  return { valid: true };
};

/*
|--------------------------------------------------------------------------
| Create Post Validation Schema
|--------------------------------------------------------------------------
|
| The client provides only post content/media.
| authorId is NEVER accepted from the client.
| It comes from req.user.userId.
|
*/
export const createPostSchema = z.object({
  body: z
    .object({
      content: z
        .string()
        .trim()
        .min(1, "Post content cannot be empty.")
        .max(5000, "Post content cannot exceed 5000 characters."),

      mediaUrl: z
        .string()
        .trim()
        .url("Invalid media URL.")
        .optional()
        .or(z.literal("")),

      mediaPublicId: z
        .string()
        .trim()
        .optional()
        .or(z.literal("")),
    })
    .refine(
      (data) => {
        const res = validatePostMedia(data.mediaUrl, data.mediaPublicId);
        return res.valid;
      },
      {
        message:
          "Invalid post media. Both mediaUrl and mediaPublicId must be valid Cloudinary post assets.",
        path: ["mediaUrl"],
      }
    ),
});

/*
|--------------------------------------------------------------------------
| Update Post Validation Schema
|--------------------------------------------------------------------------
|
| Only user-editable fields are accepted.
|
| Protected fields are intentionally excluded:
| - authorId
| - likesCount
| - commentsCount
| - isDeleted
| - isPublished
| - createdAt
| - updatedAt
|
| Ownership and authorization will be handled by the service layer.
|
*/
export const updatePostSchema = z.object({
  body: z
    .object({
      content: z
        .string()
        .trim()
        .min(1, "Post content cannot be empty.")
        .max(5000, "Post content cannot exceed 5000 characters.")
        .optional(),

      mediaUrl: z
        .string()
        .trim()
        .url("Invalid media URL.")
        .nullable()
        .optional()
        .or(z.literal("")),

      mediaPublicId: z
        .string()
        .trim()
        .nullable()
        .optional()
        .or(z.literal("")),
    })
    .refine(
      (data) => {
        const res = validatePostMedia(data.mediaUrl, data.mediaPublicId);
        return res.valid;
      },
      {
        message:
          "Invalid post media. Both mediaUrl and mediaPublicId must be valid Cloudinary post assets.",
        path: ["mediaUrl"],
      }
    ),
});

/*
|--------------------------------------------------------------------------
| Post ID Param Validation Schema
|--------------------------------------------------------------------------
*/
export const postIdParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

/*
|--------------------------------------------------------------------------
| Get Posts Query Validation Schema
|--------------------------------------------------------------------------
|
| Used later by the Posts feed endpoint.
|
*/
export const getPostsQuerySchema = z.object({
  query: z
    .object({
      page: z.coerce
        .number()
        .int("Page must be an integer.")
        .min(1, "Page must be at least 1.")
        .optional(),

      limit: z.coerce
        .number()
        .int("Limit must be an integer.")
        .min(1, "Limit must be at least 1.")
        .max(100, "Limit cannot exceed 100.")
        .optional(),

      sort: z.enum(["newest", "oldest"]).optional(),
    })
    .optional(),
});

/*
|--------------------------------------------------------------------------
| Create Comment Validation Schema
|--------------------------------------------------------------------------
|
| postId comes from the route parameter.
| authorId comes from the authenticated user.
| Neither is accepted from the request body.
|
*/
export const createCommentSchema = z.object({
  body: z.object({
    content: z
      .string()
      .trim()
      .min(1, "Comment cannot be empty.")
      .max(2000, "Comment cannot exceed 2000 characters."),
  }),
});
