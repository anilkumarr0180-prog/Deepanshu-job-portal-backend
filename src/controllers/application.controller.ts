import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as applicationService from "../services/application.service";


/*
|--------------------------------------------------------------------------
| Apply For Job
|--------------------------------------------------------------------------
|
| Controller responsibility:
|
| - Receive validated request
| - Get authenticated candidate
| - Call service
| - Return response
|
| Business logic stays in service.
|--------------------------------------------------------------------------
*/
export const applyForJob = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {

  /*
  |--------------------------------------------------------------------------
  | Get Job Id
  |--------------------------------------------------------------------------
  */

  const { id } = req.params;


  /*
  |--------------------------------------------------------------------------
  | Get Candidate Id
  |--------------------------------------------------------------------------
  |
  | authMiddleware already verified JWT.
  |
  |--------------------------------------------------------------------------
  */

  const applicantId = req.user!.userId;


  /*
  |--------------------------------------------------------------------------
  | Apply For Job
  |--------------------------------------------------------------------------
  */

  const application =
    await applicationService.applyForJob(
      id,
      applicantId,
      req.body
    );


  /*
  |--------------------------------------------------------------------------
  | Response
  |--------------------------------------------------------------------------
  */

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: "Application submitted successfully.",
    data: application,
  });
};

/*
|--------------------------------------------------------------------------
| Get My Applications
|--------------------------------------------------------------------------
|
| Controller Responsibility:
| - Get authenticated candidate
| - Call service
| - Return response
|
|--------------------------------------------------------------------------
*/

export const getMyApplications = async (
  req: Request,
  res: Response
): Promise<void> => {
  const applicantId = req.user!.userId;

  const applications =
    await applicationService.getMyApplications(
      applicantId
    );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: applications,
  });
};


/*
|--------------------------------------------------------------------------
| Get Applications For Job
|--------------------------------------------------------------------------
|
| Recruiter can view applications for their own job.
|--------------------------------------------------------------------------
*/

export const getJobApplications = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {
  const { id: jobId } = req.params;

  const recruiterId = req.user!.userId;

  const applications =
    await applicationService.getJobApplications(
      jobId,
      recruiterId
    );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: applications,
  });
};

/*
|--------------------------------------------------------------------------
| Update Application Status
|--------------------------------------------------------------------------
|
| Recruiter updates candidate application status.
|
|--------------------------------------------------------------------------
*/

export const updateApplicationStatus = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {

  const { id: applicationId } = req.params;

  const recruiterId = req.user!.userId;

  const { status } = req.body;


  const application =
    await applicationService.updateApplicationStatus(
      applicationId,
      recruiterId,
      status
    );


  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Application status updated successfully.",
    data: application,
  });
};

/*
|--------------------------------------------------------------------------
| Withdraw Application
|--------------------------------------------------------------------------
|
| Candidate can withdraw their own application.
|
|--------------------------------------------------------------------------
*/

export const withdrawApplication = async (
  req: Request<{ id: string }>,
  res: Response
): Promise<void> => {

  const { id: applicationId } = req.params;

  const applicantId = req.user!.userId;

  await applicationService.withdrawApplication(
    applicationId,
    applicantId
  );

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Application withdrawn successfully.",
  });
};