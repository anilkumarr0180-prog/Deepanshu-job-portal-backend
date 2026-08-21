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
    message: "Invalid post ID format.",
  }
);

/*
|--------------------------------------------------------------------------
| Create Reaction Validation
|--------------------------------------------------------------------------
|
| POST /api/posts/:id/reactions
|
| The post ID comes from the URL.
| The user ID comes from the authenticated user.
|
| No reaction data is accepted from the client body.
|--------------------------------------------------------------------------
*/
export const createPostReactionSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

/*
|--------------------------------------------------------------------------
| Delete Reaction Validation
|--------------------------------------------------------------------------
|
| DELETE /api/posts/:id/reactions
|--------------------------------------------------------------------------
*/
export const deletePostReactionSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});