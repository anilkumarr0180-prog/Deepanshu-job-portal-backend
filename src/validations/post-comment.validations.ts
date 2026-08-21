import { z } from "zod";
import { Types } from "mongoose";

/*
|--------------------------------------------------------------------------
| ObjectId Validation Helper
|--------------------------------------------------------------------------
*/
const objectIdSchema = z.string().refine(
  (value) => Types.ObjectId.isValid(value),
  {
    message: "Invalid ID format.",
  }
);

/*
|--------------------------------------------------------------------------
| Create Comment Validation
|--------------------------------------------------------------------------
|
| POST /api/posts/:id/comments
|
| The post ID comes from the URL.
| The author ID comes from the authenticated user.
|
| The client only provides comment content.
|--------------------------------------------------------------------------
*/
export const createPostCommentSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),

  body: z.object({
    content: z
      .string()
      .trim()
      .min(1, "Comment cannot be empty.")
      .max(
        2000,
        "Comment cannot exceed 2000 characters."
      ),
  }),
});

/*
|--------------------------------------------------------------------------
| Get Comments Validation
|--------------------------------------------------------------------------
|
| GET /api/posts/:id/comments
|--------------------------------------------------------------------------
*/
export const getPostCommentsSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),

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
        .max(
          100,
          "Limit cannot exceed 100."
        )
        .optional(),

      sort: z
        .enum(["newest", "oldest"])
        .optional(),
    })
    .optional(),
});

/*
|--------------------------------------------------------------------------
| Update Comment Validation
|--------------------------------------------------------------------------
|
| PUT /api/posts/:postId/comments/:commentId
|--------------------------------------------------------------------------
*/
export const updatePostCommentSchema = z.object({
  params: z.object({
    postId: objectIdSchema,
    commentId: objectIdSchema,
  }),

  body: z.object({
    content: z
      .string()
      .trim()
      .min(1, "Comment cannot be empty.")
      .max(
        2000,
        "Comment cannot exceed 2000 characters."
      ),
  }),
});

/*
|--------------------------------------------------------------------------
| Delete Comment Validation
|--------------------------------------------------------------------------
|
| DELETE /api/posts/:postId/comments/:commentId
|--------------------------------------------------------------------------
*/
export const deletePostCommentSchema = z.object({
  params: z.object({
    postId: objectIdSchema,
    commentId: objectIdSchema,
  }),
});