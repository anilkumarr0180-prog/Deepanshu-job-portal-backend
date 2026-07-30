import { Request, Response } from "express";
import { Types } from "mongoose";
import { HTTP_STATUS } from "../constants/http-status";
import * as jobService from "../services/job.service";

/*
|--------------------------------------------------------------------------
| Create Job
|--------------------------------------------------------------------------
*/
export const createJob = async (
  req: Request,
  res: Response
): Promise<void> => {
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
};

/*
|--------------------------------------------------------------------------
| Get All Jobs
|--------------------------------------------------------------------------
*/
export const getJobs = async (
  req: Request,
  res: Response
): Promise<void> => {
  const jobs = await jobService.getJobs(req.query);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Jobs fetched successfully.",
    data: jobs,
  });
};

/*
|--------------------------------------------------------------------------
| Get My Jobs
|--------------------------------------------------------------------------
|
| Returns all jobs created by the authenticated recruiter.
| Includes DRAFT, ACTIVE and CLOSED jobs.
|--------------------------------------------------------------------------
*/
export const getMyJobs = async (
  req: Request,
  res: Response
): Promise<void> => {
  const recruiterId = req.user!.userId;

  const jobs = await jobService.getMyJobs(recruiterId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Recruiter jobs fetched successfully.",
    data: jobs,
  });
};

/*
|--------------------------------------------------------------------------
| Get Job By Id
|--------------------------------------------------------------------------
*/
export const getJobById = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const job = await jobService.getJobById(id);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Job fetched successfully.",
    data: job,
  });
};

/*
|--------------------------------------------------------------------------
| Update Job
|--------------------------------------------------------------------------
*/
export const updateJob = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {
  const { id } = req.params;

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
};

/*
|--------------------------------------------------------------------------
| Delete Job
|--------------------------------------------------------------------------
*/
export const deleteJob = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {
  const { id } = req.params;

  const recruiterId = req.user!.userId;

  await jobService.deleteJob(
    id,
    recruiterId
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Job deleted successfully.",
  });
};