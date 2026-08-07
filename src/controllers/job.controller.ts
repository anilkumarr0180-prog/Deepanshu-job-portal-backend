import { Request, Response } from "express";
import { Types } from "mongoose";
import { HTTP_STATUS } from "../constants/http-status";
import * as jobService from "../services/job.service";
import { asyncHandler } from "../middleware/async-handler";
import { verifyAccessToken } from "../utils/jwt";

/*
|--------------------------------------------------------------------------
| Create Job
|--------------------------------------------------------------------------
*/
export const createJob = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const recruiterId = new Types.ObjectId(req.user!.userId);

    const job = await jobService.createJob(
      req.body,
      recruiterId
    );

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Job created successfully.",
      data: job,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get All Jobs
|--------------------------------------------------------------------------
*/
export const getJobs = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const jobs = await jobService.getJobs(req.query);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Jobs fetched successfully.",
      data: jobs,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get My Jobs
|--------------------------------------------------------------------------
|
| Returns all jobs created by the authenticated recruiter.
| Includes DRAFT, ACTIVE and CLOSED jobs.
|--------------------------------------------------------------------------
*/
export const getMyJobs = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const recruiterId = req.user!.userId;

    const jobs = await jobService.getMyJobs(recruiterId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Recruiter jobs fetched successfully.",
      data: jobs,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get Job By Id
|--------------------------------------------------------------------------
*/
export const getJobById = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;

    let currentUser: { userId: string; role: string } | undefined = req.user;
    if (!currentUser && req.headers.authorization?.startsWith("Bearer ")) {
      try {
        const token = req.headers.authorization.split(" ")[1];
        if (token) {
          currentUser = verifyAccessToken(token);
        }
      } catch {
        // Optional user extraction for public route
      }
    }

    const job = await jobService.getJobById(id, currentUser);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Job fetched successfully.",
      data: job,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Update Job
|--------------------------------------------------------------------------
*/
export const updateJob = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;

    const recruiterId = req.user!.userId;

    const job = await jobService.updateJob(
      id,
      recruiterId,
      req.body
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Job updated successfully.",
      data: job,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Delete Job
|--------------------------------------------------------------------------
*/
export const deleteJob = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;

    const recruiterId = req.user!.userId;

    await jobService.deleteJob(
      id,
      recruiterId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Job deleted successfully.",
    });
  }
);