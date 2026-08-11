import { Router } from "express";

import {
  createJob,
  getJobs,
  getMyJobs,
  getJobById,
  updateJob,
  deleteJob,
} from "../controllers/job.controller";

import { authMiddleware } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { validate } from "../middleware/validation.middleware";

import {
  createJobSchema,
  updateJobSchema,
  getJobsQuerySchema,
  jobIdParamSchema,
} from "../validations/job.validations";

import { USER_ROLES } from "../constants/roles";
import { checkSubscriptionJobLimit } from "../middleware/subscription-quota.middleware";

const router = Router();

/*
|--------------------------------------------------------------------------
| Get All Jobs
|--------------------------------------------------------------------------
| Route:
| GET /api/jobs
|
| Access:
| Public
|--------------------------------------------------------------------------
*/
router.get("/", validate(getJobsQuerySchema), getJobs);

/*
|--------------------------------------------------------------------------
| Get My Jobs
|--------------------------------------------------------------------------
| Route:
| GET /api/jobs/my-jobs
|
| Access:
| Recruiter only
|--------------------------------------------------------------------------
*/
router.get(
  "/my-jobs",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER),
  getMyJobs
);

/*
|--------------------------------------------------------------------------
| Get Job By Id
|--------------------------------------------------------------------------
| Route:
| GET /api/jobs/:id
|
| Access:
| Public
|--------------------------------------------------------------------------
*/
router.get("/:id", validate(jobIdParamSchema), getJobById);

/*
|--------------------------------------------------------------------------
| Create Job
|--------------------------------------------------------------------------
| Route:
| POST /api/jobs
|
| Access:
| Recruiter only
|--------------------------------------------------------------------------
*/
router.post(
  "/",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER),
  checkSubscriptionJobLimit,
  validate(createJobSchema),
  createJob
);

/*
|--------------------------------------------------------------------------
| Update Job
|--------------------------------------------------------------------------
| Route:
| PUT /api/jobs/:id
|
| Access:
| Recruiter only
|
| Rules:
| - User must be authenticated
| - User must be recruiter
| - User can update only their own jobs
|--------------------------------------------------------------------------
*/
router.put(
  "/:id",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER),
  validate(jobIdParamSchema),
  validate(updateJobSchema),
  updateJob
);

/*
|--------------------------------------------------------------------------
| Delete Job
|--------------------------------------------------------------------------
| Route:
| DELETE /api/jobs/:id
|
| Access:
| Recruiter only
|
| Rules:
| - User must be authenticated
| - User must be recruiter
| - User can delete only their own jobs
|--------------------------------------------------------------------------
*/
router.delete(
  "/:id",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER),
  validate(jobIdParamSchema),
  deleteJob
);

export default router;