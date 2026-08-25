import { z } from "zod";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const savedPostIdParamSchema = z.object({
  params: z.object({
    postId: z.string().regex(objectIdRegex, "Invalid post ID format"),
  }),
});

export const getSavedPostsQuerySchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    sort: z.enum(["newest", "oldest"]).optional(),
  }),
});
