import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as adminService from "../services/admin.service";
import { asyncHandler } from "../middleware/async-handler";

/*
|--------------------------------------------------------------------------
| Admin Dashboard
|--------------------------------------------------------------------------
*/

export const getAdminDashboard = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const dashboard = await adminService.getDashboardStats();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Admin dashboard fetched successfully.",
      data: dashboard,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get All Users
|--------------------------------------------------------------------------
*/

export const getUsers = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getUsers(req.query);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Users fetched successfully.",
      data: result,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get User By ID
|--------------------------------------------------------------------------
*/

export const getUserById = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await adminService.getUserById(req.params.id as string);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "User details fetched successfully.",
      data: user,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Block User
|--------------------------------------------------------------------------
*/

export const blockUser = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await adminService.blockUser(req.params.id as string);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "User blocked successfully.",
      data: user,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Unblock User
|--------------------------------------------------------------------------
*/

export const unblockUser = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await adminService.unblockUser(req.params.id as string);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "User unblocked successfully.",
      data: user,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get Admin Jobs
|--------------------------------------------------------------------------
*/

export const getAdminJobs = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await adminService.getAdminJobs(req.query);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Jobs fetched successfully.",
      data: result,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Delete Admin Job
|--------------------------------------------------------------------------
*/

export const deleteAdminJob = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await adminService.deleteAdminJob(req.params.id as string);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Job deleted successfully.",
      data: null,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Verify Company (Admin Only)
|--------------------------------------------------------------------------
*/

export const verifyCompany = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const companyId = (req.params.companyId || req.params.id) as string;
    const { isVerified } = req.body;

    const company = await adminService.verifyCompany(companyId, isVerified);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Company verification updated successfully.",
      data: company,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Check SMTP Status (Admin Only)
|--------------------------------------------------------------------------
*/

export const getSmtpStatus = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const { verifySmtpConnection } = await import("../services/email.service");
    const status = await verifySmtpConnection();

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: status.message,
      data: status,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Send Test Email (Admin Only)
|--------------------------------------------------------------------------
*/

export const sendTestEmailController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { sendTestEmail } = await import("../services/email.service");
    const { email } = req.body;

    if (!email) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Target email address is required.",
      });
      return;
    }

    const result = await sendTestEmail(email);

    res.status(result.success ? HTTP_STATUS.OK : HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: result.success,
      message: result.message,
      data: result,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Financial & Billing Command Center Controllers
|--------------------------------------------------------------------------
*/

export const getFinanceOverviewController = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const data = await adminService.getFinanceOverview();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Financial overview retrieved successfully.",
      data,
    });
  }
);

export const getAdminTransactionsController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const data = await adminService.getAdminTransactions(req.query);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Transactions retrieved successfully.",
      data,
    });
  }
);

export const getAdminPlansController = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const data = await adminService.getAdminPlans();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Subscription plans retrieved successfully.",
      data,
    });
  }
);

export const createAdminPlanController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const data = await adminService.createAdminPlan(req.body);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Subscription plan created successfully.",
      data,
    });
  }
);

export const updateAdminPlanController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const data = await adminService.updateAdminPlan(req.params.planId as string, req.body);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Subscription plan updated successfully.",
      data,
    });
  }
);

export const getAdminCouponsController = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const data = await adminService.getAdminCoupons();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Coupons retrieved successfully.",
      data,
    });
  }
);

export const createAdminCouponController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const data = await adminService.createAdminCoupon(req.body);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Coupon created successfully.",
      data,
    });
  }
);

export const toggleAdminCouponController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const data = await adminService.toggleAdminCoupon(req.params.couponId as string);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Coupon status toggled to ${data.isActive ? "Active" : "Inactive"}.`,
      data,
    });
  }
);

export const overrideUserSubscriptionController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId, planCode, durationDays, reason } = req.body;
    const data = await adminService.overrideUserSubscription(
      userId,
      planCode,
      durationDays,
      reason
    );
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "User subscription granted/overridden successfully.",
      data,
    });
  }
);



/*
|--------------------------------------------------------------------------
| Polar Catalog Sync Controller
|--------------------------------------------------------------------------
*/
import { ensureAllPolarPlans } from "../services/polar-catalog.service";

export const syncPolarCatalogController = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const summary = await ensureAllPolarPlans();
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Polar catalog synced! Created ${summary.createdProducts} products, ${summary.createdPrices} prices. Existing: ${summary.existingMappings}. Errors: ${summary.errors}.`,
      data: summary,
    });
  }
);
