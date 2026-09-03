import { Router } from "express";
import {
  getBlogs,
  getBlogBySlug,
  getBlogCategories,
  getTrendingBlogs,
  getFeaturedBlogs,
  getMyBlogs,
  getMyBlogById,
  createMyBlog,
  updateMyBlog,
  deleteMyBlog,
  publishMyBlog,
  unpublishMyBlog,
} from "../controllers/blog.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { validate } from "../middleware/validation.middleware";
import { USER_ROLES } from "../constants/roles";
import {
  getPublicBlogsQuerySchema,
  blogSlugParamSchema,
  blogIdParamSchema,
  createCandidateBlogSchema,
  updateCandidateBlogSchema,
  getCandidateBlogsQuerySchema,
} from "../validations/blog.validations";

const router = Router();

/*
|--------------------------------------------------------------------------
| Public Blog Routes (Non-parameterized)
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

/*
|--------------------------------------------------------------------------
| Candidate & Recruiter / Author Blog Management Routes (/api/blogs/my)
|--------------------------------------------------------------------------
|
| Author operations are strictly authenticated and authorized for Candidates and Recruiters.
| Placed before /:slug to prevent "my" from being matched as a blog slug.
|
|--------------------------------------------------------------------------
*/

router.get(
  "/my",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE, USER_ROLES.RECRUITER),
  validate(getCandidateBlogsQuerySchema),
  getMyBlogs
);

router.post(
  "/my",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE, USER_ROLES.RECRUITER),
  validate(createCandidateBlogSchema),
  createMyBlog
);

router.get(
  "/my/:id",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE, USER_ROLES.RECRUITER),
  validate(blogIdParamSchema),
  getMyBlogById
);

router.patch(
  "/my/:id",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE, USER_ROLES.RECRUITER),
  validate(updateCandidateBlogSchema),
  updateMyBlog
);

router.delete(
  "/my/:id",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE, USER_ROLES.RECRUITER),
  validate(blogIdParamSchema),
  deleteMyBlog
);

router.patch(
  "/my/:id/publish",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE, USER_ROLES.RECRUITER),
  validate(blogIdParamSchema),
  publishMyBlog
);

router.patch(
  "/my/:id/unpublish",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE, USER_ROLES.RECRUITER),
  validate(blogIdParamSchema),
  unpublishMyBlog
);

/*
|--------------------------------------------------------------------------
| Public Blog Feed & Dynamic Slug Routes
|--------------------------------------------------------------------------
*/

router.get("/", validate(getPublicBlogsQuerySchema), getBlogs);
router.get("/:slug", validate(blogSlugParamSchema), getBlogBySlug);

export default router;

