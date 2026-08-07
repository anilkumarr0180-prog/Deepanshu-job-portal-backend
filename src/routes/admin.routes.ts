import { Router } from "express";
import {
  getAdminDashboard,
  getUsers,
  getUserById,
  blockUser,
  unblockUser,
  getAdminJobs,
  deleteAdminJob,
  verifyCompany,
} from "../controllers/admin.controller";

import { authMiddleware } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { validate } from "../middleware/validation.middleware";
import { USER_ROLES } from "../constants/roles";
import {
  getUsersQuerySchema,
  userIdParamSchema,
  getAdminJobsQuerySchema,
  jobIdParamSchema,
  verifyCompanySchema,
} from "../validations/admin.validations";

const router = Router();

/*
|--------------------------------------------------------------------------
| Admin Dashboard
|--------------------------------------------------------------------------
*/

router.get(
  "/dashboard",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  getAdminDashboard
);

/*
|--------------------------------------------------------------------------
| Admin Users Management
|--------------------------------------------------------------------------
*/

router.get(
  "/users",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  validate(getUsersQuerySchema),
  getUsers
);

router.get(
  "/users/:id",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  validate(userIdParamSchema),
  getUserById
);

router.patch(
  "/users/:id/block",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  validate(userIdParamSchema),
  blockUser
);

router.patch(
  "/users/:id/unblock",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  validate(userIdParamSchema),
  unblockUser
);

/*
|--------------------------------------------------------------------------
| Admin Jobs Management
|--------------------------------------------------------------------------
*/

router.get(
  "/jobs",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  validate(getAdminJobsQuerySchema),
  getAdminJobs
);

router.delete(
  "/jobs/:id",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  validate(jobIdParamSchema),
  deleteAdminJob
);

/*
|--------------------------------------------------------------------------
| Admin Company Verification
|--------------------------------------------------------------------------
*/

router.patch(
  "/companies/:companyId/verify",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  validate(verifyCompanySchema),
  verifyCompany
);

router.patch(
  "/company/:companyId/verify",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  validate(verifyCompanySchema),
  verifyCompany
);

export default router;