import { Router } from "express";
import {
  saveJob,
  removeSavedJob,
  getMySavedJobs,
  checkSavedStatus,
} from "../controllers/saved-job.controller";

import { authMiddleware } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { validate } from "../middleware/validation.middleware";
import { USER_ROLES } from "../constants/roles";
import {
  jobIdParamSchema,
  getSavedJobsQuerySchema,
} from "../validations/saved-job.validations";

const router = Router();

/*
|--------------------------------------------------------------------------
| Get My Saved Jobs (Candidate Only)
|--------------------------------------------------------------------------
| Route: GET /api/saved-jobs
| Access: Candidate Only
|--------------------------------------------------------------------------
*/
router.get(
  "/",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE),
  validate(getSavedJobsQuerySchema),
  getMySavedJobs
);

/*
|--------------------------------------------------------------------------
| Check Saved Status
|--------------------------------------------------------------------------
| Route: GET /api/saved-jobs/:jobId/status
| Access: Candidate Only
|--------------------------------------------------------------------------
*/
router.get(
  "/:jobId/status",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE),
  validate(jobIdParamSchema),
  checkSavedStatus
);

/*
|--------------------------------------------------------------------------
| Save Job (Bookmark)
|--------------------------------------------------------------------------
| Route: POST /api/saved-jobs/:jobId
| Access: Candidate Only
|--------------------------------------------------------------------------
*/
router.post(
  "/:jobId",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE),
  validate(jobIdParamSchema),
  saveJob
);

/*
|--------------------------------------------------------------------------
| Remove Saved Job
|--------------------------------------------------------------------------
| Route: DELETE /api/saved-jobs/:jobId
| Access: Candidate Only
|--------------------------------------------------------------------------
*/
router.delete(
  "/:jobId",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE),
  validate(jobIdParamSchema),
  removeSavedJob
);

export default router;
