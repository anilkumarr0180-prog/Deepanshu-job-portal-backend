import { Router } from "express";
import {
  savePost,
  removeSavedPost,
  checkSavedStatus,
  getMySavedPosts,
} from "../controllers/saved-post.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import {
  savedPostIdParamSchema,
  getSavedPostsQuerySchema,
} from "../validations/saved-post.validations";

const router = Router();

router.get("/", authMiddleware, validate(getSavedPostsQuerySchema), getMySavedPosts);
router.get("/:postId/status", authMiddleware, validate(savedPostIdParamSchema), checkSavedStatus);
router.post("/:postId", authMiddleware, validate(savedPostIdParamSchema), savePost);
router.delete("/:postId", authMiddleware, validate(savedPostIdParamSchema), removeSavedPost);

export default router;
