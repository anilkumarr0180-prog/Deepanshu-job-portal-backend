import { Router } from "express";

import {
  applyForJob,
  getMyApplications,
  getJobApplications,
  getRecruiterApplications,
  updateApplicationStatus,
  getApplicationHistory,
  withdrawApplication,
} from "../controllers/application.controller";

import { authMiddleware } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { validate } from "../middleware/validation.middleware";

import {
  applyJobSchema,
  getJobApplicationsSchema,
  updateApplicationStatusSchema,
  getApplicationHistorySchema,
  withdrawApplicationSchema,
  getApplicationsQuerySchema,
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
  validate(getApplicationsQuerySchema),
  getMyApplications
);

/*
|--------------------------------------------------------------------------
| Get All Applications For Recruiter Across All Jobs
|--------------------------------------------------------------------------
*/

router.get(
  "/applications/recruiter",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER),
  validate(getApplicationsQuerySchema),
  getRecruiterApplications
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
  validate(getJobApplicationsSchema),
  validate(getApplicationsQuerySchema),
  getJobApplications
);

/*
|--------------------------------------------------------------------------
| Update Application Status (PATCH & PUT for ATS Workflow)
|--------------------------------------------------------------------------
*/

router.patch(
  "/applications/:id/status",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN),
  validate(updateApplicationStatusSchema),
  updateApplicationStatus
);

router.put(
  "/applications/:id/status",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN),
  validate(updateApplicationStatusSchema),
  updateApplicationStatus
);

/*
|--------------------------------------------------------------------------
| Get Application Status History (Audit Trail)
|--------------------------------------------------------------------------
*/

router.get(
  "/applications/:id/history",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN, USER_ROLES.CANDIDATE),
  validate(getApplicationHistorySchema),
  getApplicationHistory
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
