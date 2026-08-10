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

