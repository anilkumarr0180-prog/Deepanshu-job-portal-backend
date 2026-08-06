import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as savedJobService from "../services/saved-job.service";
import { asyncHandler } from "../middleware/async-handler";

/*
|--------------------------------------------------------------------------
| Save Job (Bookmark)
|--------------------------------------------------------------------------
*/
export const saveJob = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const jobId = req.params.jobId as string;

    const result = await savedJobService.saveJob(userId, jobId);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Job saved successfully.",
      data: result,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Remove Saved Job
|--------------------------------------------------------------------------
*/
export const removeSavedJob = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const jobId = req.params.jobId as string;

    const result = await savedJobService.removeSavedJob(
      userId,
      jobId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Job removed successfully.",
      data: result,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get My Saved Jobs (Candidate Only)
|--------------------------------------------------------------------------
*/
export const getMySavedJobs = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;

    const result = await savedJobService.getMySavedJobs(userId, req.query);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Saved jobs fetched successfully.",
      data: result,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Check Saved Status
|--------------------------------------------------------------------------
*/
export const checkSavedStatus = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const jobId = req.params.jobId as string;

    const result = await savedJobService.checkSavedStatus(
      userId,
      jobId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Saved status checked successfully.",
      data: result,
    });
  }
);
