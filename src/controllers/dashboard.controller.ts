import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as dashboardService from "../services/dashboard.service";
import { asyncHandler } from "../middleware/async-handler";

/*
|--------------------------------------------------------------------------
| Recruiter Dashboard
|--------------------------------------------------------------------------
*/

export const getRecruiterDashboard = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const recruiterId = req.user!.userId;

    const dashboard =
      await dashboardService.getRecruiterDashboard(
        recruiterId
      );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Recruiter dashboard fetched successfully.",
      data: dashboard,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Candidate Dashboard
|--------------------------------------------------------------------------
*/

export const getCandidateDashboard = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const candidateId = req.user!.userId;

    const dashboard =
      await dashboardService.getCandidateDashboard(
        candidateId
      );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Candidate dashboard fetched successfully.",
      data: dashboard,
    });
  }
);