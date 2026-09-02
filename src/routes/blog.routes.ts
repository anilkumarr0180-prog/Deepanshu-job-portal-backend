import { Router } from "express";
import {
  getBlogs,
  getBlogBySlug,
  getBlogCategories,
  getTrendingBlogs,
  getFeaturedBlogs,
} from "../controllers/blog.controller";
import { validate } from "../middleware/validation.middleware";
import {
  getPublicBlogsQuerySchema,
  blogSlugParamSchema,
} from "../validations/blog.validations";

const router = Router();

/*
|--------------------------------------------------------------------------
| Public Blog Routes
|--------------------------------------------------------------------------
|
| Specific resource paths (/categories, /trending, /featured) are placed
| BEFORE dynamic /:slug to prevent path collisions.
|
| All public routes return ONLY published, non-deleted blogs.
|
|--------------------------------------------------------------------------
*/

router.get("/categories", getBlogCategories);
router.get("/trending", getTrendingBlogs);
router.get("/featured", getFeaturedBlogs);
router.get("/", validate(getPublicBlogsQuerySchema), getBlogs);
router.get("/:slug", validate(blogSlugParamSchema), getBlogBySlug);

export default router;
