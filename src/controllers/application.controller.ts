import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as applicationService from "../services/application.service";
import { asyncHandler } from "../middleware/async-handler";

/*
|--------------------------------------------------------------------------
| Apply For Job
|--------------------------------------------------------------------------
*/
export const applyForJob = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const applicantId = req.user!.userId;

    const application = await applicationService.applyForJob(
      id,
      applicantId,
      req.body
    );

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Application submitted successfully.",
      data: application,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get My Applications
|--------------------------------------------------------------------------
*/
export const getMyApplications = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const applicantId = req.user!.userId;

    const applications = await applicationService.getMyApplications(
      applicantId,
      req.query
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: applications,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get Applications For Job
|--------------------------------------------------------------------------
*/
export const getJobApplications = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const jobId = req.params.id as string;
    const recruiterId = req.user!.userId;

    const applications = await applicationService.getJobApplications(
      jobId,
      recruiterId,
      req.query
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: applications,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get All Applications For Recruiter Across All Jobs
|--------------------------------------------------------------------------
*/
export const getRecruiterApplications = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const recruiterId = req.user!.userId;

    const applications = await applicationService.getRecruiterApplications(
      recruiterId,
      req.query
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: applications,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Update Application Status
|--------------------------------------------------------------------------
*/
export const updateApplicationStatus = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const applicationId = req.params.id as string;
    const recruiterId = req.user!.userId;
    const { status } = req.body;

    const application = await applicationService.updateApplicationStatus(
      applicationId,
      recruiterId,
      status
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Application status updated successfully.",
      data: application,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Withdraw Application
|--------------------------------------------------------------------------
*/
export const withdrawApplication = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const applicationId = req.params.id as string;
    const applicantId = req.user!.userId;

    await applicationService.withdrawApplication(
      applicationId,
      applicantId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Application withdrawn successfully.",
    });
  }
);