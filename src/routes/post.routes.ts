import { Router } from "express";
import {
  createPost,
  repostPost,
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
  repostPostSchema,
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

router.get(
  "/",
  optionalAuthMiddleware,
  validate(getPostsQuerySchema),
  getPosts
);

router.post(
  "/",
  authMiddleware,
  validate(createPostSchema),
  createPost
);

router.post(
  "/:id/repost",
  authMiddleware,
  validate(repostPostSchema),
  repostPost
);

router.post(
  "/:id/reactions",
  authMiddleware,
  validate(createPostReactionSchema),
  createPostReaction
);

router.delete(
  "/:id/reactions",
  authMiddleware,
  validate(deletePostReactionSchema),
  deletePostReaction
);

router.post(
  "/:id/comments",
  authMiddleware,
  validate(createPostCommentSchema),
  createPostComment
);

router.get(
  "/:id/comments",
  validate(getPostCommentsSchema),
  getPostComments
);

router.put(
  "/:postId/comments/:commentId",
  authMiddleware,
  validate(updatePostCommentSchema),
  updatePostComment
);

router.delete(
  "/:postId/comments/:commentId",
  authMiddleware,
  validate(deletePostCommentSchema),
  deletePostComment
);

router.get(
  "/:id",
  optionalAuthMiddleware,
  validate(postIdParamSchema),
  getPostById
);

router.put(
  "/:id",
  authMiddleware,
  validate(postIdParamSchema),
  validate(updatePostSchema),
  updatePost
);

router.delete(
  "/:id",
  authMiddleware,
  validate(postIdParamSchema),
  deletePost
);

export default router;
