import { Router } from "express";

import {
  createPost,
  getPosts,
  getPostById,
  updatePost,
  deletePost,
} from "../controllers/post.controller";

import {
  createPostReaction,
  deletePostReaction,
} from "../controllers/post-reaction.controller";

import {
  createPostComment,
  getPostComments,
  updatePostComment,
  deletePostComment,
} from "../controllers/post-comment.controller";

import { authMiddleware, optionalAuthMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";

import {
  createPostSchema,
  updatePostSchema,
  getPostsQuerySchema,
  postIdParamSchema,
} from "../validations/post.validations";

import {
  createPostReactionSchema,
  deletePostReactionSchema,
} from "../validations/post-reaction.validations";

import {
  createPostCommentSchema,
  getPostCommentsSchema,
  updatePostCommentSchema,
  deletePostCommentSchema,
} from "../validations/post-comment.validations";

const router = Router();

/*
|--------------------------------------------------------------------------
| Get All Posts
|--------------------------------------------------------------------------
| GET /api/posts
| Access: Public / Optional Authentication
|--------------------------------------------------------------------------
*/
router.get(
  "/",
  optionalAuthMiddleware,
  validate(getPostsQuerySchema),
  getPosts
);

/*
|--------------------------------------------------------------------------
| Create Post
|--------------------------------------------------------------------------
| POST /api/posts
| Access: Authenticated users
|--------------------------------------------------------------------------
*/
router.post(
  "/",
  authMiddleware,
  validate(createPostSchema),
  createPost
);

/*
|--------------------------------------------------------------------------
| Like Post
|--------------------------------------------------------------------------
| POST /api/posts/:id/reactions
| Access: Authenticated users
|--------------------------------------------------------------------------
*/
router.post(
  "/:id/reactions",
  authMiddleware,
  validate(createPostReactionSchema),
  createPostReaction
);

/*
|--------------------------------------------------------------------------
| Unlike Post
|--------------------------------------------------------------------------
| DELETE /api/posts/:id/reactions
| Access: Authenticated users
|--------------------------------------------------------------------------
*/
router.delete(
  "/:id/reactions",
  authMiddleware,
  validate(deletePostReactionSchema),
  deletePostReaction
);

/*
|--------------------------------------------------------------------------
| Create Comment
|--------------------------------------------------------------------------
| POST /api/posts/:id/comments
| Access: Authenticated users
|--------------------------------------------------------------------------
*/
router.post(
  "/:id/comments",
  authMiddleware,
  validate(createPostCommentSchema),
  createPostComment
);

/*
|--------------------------------------------------------------------------
| Get Comments
|--------------------------------------------------------------------------
| GET /api/posts/:id/comments
| Access: Public
|--------------------------------------------------------------------------
*/
router.get(
  "/:id/comments",
  validate(getPostCommentsSchema),
  getPostComments
);

/*
|--------------------------------------------------------------------------
| Update Comment
|--------------------------------------------------------------------------
| PUT /api/posts/:postId/comments/:commentId
| Access: Authenticated users
|
| Ownership is checked inside the service.
|--------------------------------------------------------------------------
*/
router.put(
  "/:postId/comments/:commentId",
  authMiddleware,
  validate(updatePostCommentSchema),
  updatePostComment
);

/*
|--------------------------------------------------------------------------
| Delete Comment
|--------------------------------------------------------------------------
| DELETE /api/posts/:postId/comments/:commentId
| Access: Authenticated users
|
| Ownership is checked inside the service.
| Uses soft deletion.
|--------------------------------------------------------------------------
*/
router.delete(
  "/:postId/comments/:commentId",
  authMiddleware,
  validate(deletePostCommentSchema),
  deletePostComment
);

/*
|--------------------------------------------------------------------------
| Get Post By Id
|--------------------------------------------------------------------------
| GET /api/posts/:id
| Access: Public / Optional Authentication
|--------------------------------------------------------------------------
*/
router.get(
  "/:id",
  optionalAuthMiddleware,
  validate(postIdParamSchema),
  getPostById
);

/*
|--------------------------------------------------------------------------
| Update Post
|--------------------------------------------------------------------------
| PUT /api/posts/:id
| Access: Authenticated users
|--------------------------------------------------------------------------
*/
router.put(
  "/:id",
  authMiddleware,
  validate(postIdParamSchema),
  validate(updatePostSchema),
  updatePost
);

/*
|--------------------------------------------------------------------------
| Delete Post
|--------------------------------------------------------------------------
| DELETE /api/posts/:id
| Access: Authenticated users
|
| Uses soft deletion.
|--------------------------------------------------------------------------
*/
router.delete(
  "/:id",
  authMiddleware,
  validate(postIdParamSchema),
  deletePost
);

export default router;