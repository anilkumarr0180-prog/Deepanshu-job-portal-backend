import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as adminService from "../services/admin.service";

/*
|--------------------------------------------------------------------------
| Admin Dashboard
|--------------------------------------------------------------------------
*/

export const getAdminDashboard = async (
  req: Request,
  res: Response
): Promise<void> => {
  // const dashboard = await adminService.getDashboardStats();

    console.log("Admin dashboard fetched successfully:");

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Admin dashboard fetched successfully.",
    // data: dashboard,
  });
};