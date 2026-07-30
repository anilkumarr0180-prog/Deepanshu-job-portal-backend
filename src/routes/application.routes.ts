import { Router } from "express";

import {
  applyForJob,
  getMyApplications,
  getJobApplications,
  updateApplicationStatus,
  withdrawApplication,
} from "../controllers/application.controller";

import { authMiddleware } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { validate } from "../middleware/validation.middleware";

import {
  applyJobSchema,
  updateApplicationStatusSchema,
  withdrawApplicationSchema,
} from "../validations/application.validations";

import { USER_ROLES } from "../constants/roles";

const router = Router();

/*
|--------------------------------------------------------------------------
| Apply For Job
|--------------------------------------------------------------------------
*/

router.post(
  "/jobs/:id/apply",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE),
  validate(applyJobSchema),
  applyForJob
);

/*
|--------------------------------------------------------------------------
| Get My Applications
|--------------------------------------------------------------------------
*/

router.get(
  "/applications/my",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE),
  getMyApplications
);

/*
|--------------------------------------------------------------------------
| Get Applications For Job
|--------------------------------------------------------------------------
*/

router.get(
  "/jobs/:id/applications",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER),
  getJobApplications
);

/*
|--------------------------------------------------------------------------
| Update Application Status
|--------------------------------------------------------------------------
*/

router.put(
  "/applications/:id/status",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER),
  validate(updateApplicationStatusSchema),
  updateApplicationStatus
);

/*
|--------------------------------------------------------------------------
| Withdraw Application
|--------------------------------------------------------------------------
*/

router.delete(
  "/applications/:id",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE),
  validate(withdrawApplicationSchema),
  withdrawApplication
);

export default router;