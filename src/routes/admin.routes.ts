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
  getSmtpStatus,
  sendTestEmailController,
  getFinanceOverviewController,
  getAdminTransactionsController,
  getAdminPlansController,
  createAdminPlanController,
  updateAdminPlanController,
  getAdminCouponsController,
  createAdminCouponController,
  toggleAdminCouponController,
  overrideUserSubscriptionController,
  syncPolarCatalogController,
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

/*
|--------------------------------------------------------------------------
| SMTP Configuration & Test Routes
|--------------------------------------------------------------------------
*/

router.get(
  "/smtp-status",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  getSmtpStatus
);

router.post(
  "/send-test-email",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  sendTestEmailController
);

/*
|--------------------------------------------------------------------------
| Financial & Billing Command Center Routes
|--------------------------------------------------------------------------
*/

router.get(
  "/finance/overview",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  getFinanceOverviewController
);

router.get(
  "/finance/transactions",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  getAdminTransactionsController
);

router.post(
  "/finance/plans/sync-polar",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  syncPolarCatalogController
);

router.get(
  "/finance/plans",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  getAdminPlansController
);

router.post(
  "/finance/plans",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  createAdminPlanController
);

router.put(
  "/finance/plans/:planId",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  updateAdminPlanController
);

router.get(
  "/finance/coupons",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  getAdminCouponsController
);

router.post(
  "/finance/coupons",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  createAdminCouponController
);

router.patch(
  "/finance/coupons/:couponId/toggle",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  toggleAdminCouponController
);

router.post(
  "/finance/subscriptions/override",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  overrideUserSubscriptionController
);

export default router;
