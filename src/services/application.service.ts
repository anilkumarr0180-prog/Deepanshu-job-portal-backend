import Application from "../models/application.model";
import Job from "../models/job.model";
import User from "../models/user.model";

import { AppError } from "../utils/app-error";

import { HTTP_STATUS } from "../constants/http-status";
import { APPLICATION_STATUS } from "../constants/application-status";
import { JOB_STATUS } from "../constants/job-status";

interface ApplyJobInput {
  coverLetter?: string;
}

/*
|--------------------------------------------------------------------------
| Apply For Job
|--------------------------------------------------------------------------
|
| Business Rules:
|
| - Job must exist
| - Job must be ACTIVE
| - Candidate must exist
| - Candidate must upload resume before applying
| - Candidate cannot apply twice
| - Application stores the resume from candidate profile
|
|--------------------------------------------------------------------------
*/

export const applyForJob = async (
  jobId: string,
  applicantId: string,
  applicationData: ApplyJobInput
) => {
  /* -------------------------------------------------------------------------- */
  /* Check Job Exists                                                            */
  /* -------------------------------------------------------------------------- */

  const job = await Job.findById(jobId);

  if (!job) {
    throw new AppError(
      "Job not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Job Status Check                                                            */
  /* -------------------------------------------------------------------------- */

  if (job.status !== JOB_STATUS.ACTIVE) {
    throw new AppError(
      "This job is not accepting applications.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Check Candidate Exists                                                      */
  /* -------------------------------------------------------------------------- */

  const candidate = await User.findById(applicantId).select(
    "resumeUrl"
  );

  if (!candidate) {
    throw new AppError(
      "User not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Resume Check                                                                */
  /* -------------------------------------------------------------------------- */

  if (!candidate.resumeUrl) {
    throw new AppError(
      "Please upload your resume before applying.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Duplicate Application Check                                                 */
  /* -------------------------------------------------------------------------- */

  const existingApplication = await Application.findOne({
    jobId,
    applicantId,
  });

  if (existingApplication) {
    throw new AppError(
      "You have already applied for this job.",
      HTTP_STATUS.CONFLICT
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Create Application                                                          */
  /* -------------------------------------------------------------------------- */

  const application = await Application.create({
    jobId,
    applicantId,
    resume: candidate.resumeUrl,
    coverLetter: applicationData.coverLetter,
    status: APPLICATION_STATUS.APPLIED,
  });

  return application;
};

/*
|--------------------------------------------------------------------------
| Get My Applications
|--------------------------------------------------------------------------
*/

export const getMyApplications = async (
  applicantId: string
) => {
  const applications = await Application.find({
    applicantId,
  })
    .populate({
      path: "jobId",
      select:
        "title company location salaryMin salaryMax employmentType experienceLevel status",
    })
    .sort({
      createdAt: -1,
    });

  return applications;
};

/*
|--------------------------------------------------------------------------
| Get Applications For Job
|--------------------------------------------------------------------------
*/

export const getJobApplications = async (
  jobId: string,
  recruiterId: string
) => {
  /*
  |--------------------------------------------------------------------------
  | Check Job Exists
  |--------------------------------------------------------------------------
  */

  const job = await Job.findById(jobId);

  if (!job) {
    throw new AppError(
      "Job not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Check Job Ownership
  |--------------------------------------------------------------------------
  */

  if (job.recruiterId.toString() !== recruiterId) {
    throw new AppError(
      "You are not authorized to view these applications.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Get Applications
  |--------------------------------------------------------------------------
  */

  const applications = await Application.find({
    jobId,
  })
    .populate({
      path: "applicantId",
      select: "name email phone resumeUrl",
    })
    .sort({
      createdAt: -1,
    });

  return applications;
};

/*
|--------------------------------------------------------------------------
| Update Application Status
|--------------------------------------------------------------------------
*/

export const updateApplicationStatus = async (
  applicationId: string,
  recruiterId: string,
  status: string
) => {
  /*
  |--------------------------------------------------------------------------
  | Find Application
  |--------------------------------------------------------------------------
  */

  const application =
    await Application.findById(applicationId);

  if (!application) {
    throw new AppError(
      "Application not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Check Job Ownership
  |--------------------------------------------------------------------------
  */

  const job = await Job.findById(application.jobId);

  if (!job) {
    throw new AppError(
      "Job not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  if (job.recruiterId.toString() !== recruiterId) {
    throw new AppError(
      "You are not authorized to update this application.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Update Status
  |--------------------------------------------------------------------------
  */

  application.status = status as any;

  await application.save();

  return application;
};

/*
|--------------------------------------------------------------------------
| Withdraw Application
|--------------------------------------------------------------------------
*/

export const withdrawApplication = async (
  applicationId: string,
  applicantId: string
) => {
  /*
  |--------------------------------------------------------------------------
  | Find Application
  |--------------------------------------------------------------------------
  */

  const application =
    await Application.findById(applicationId);

  if (!application) {
    throw new AppError(
      "Application not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Check Ownership
  |--------------------------------------------------------------------------
  */

  if (
    application.applicantId.toString() !==
    applicantId
  ) {
    throw new AppError(
      "You are not authorized to withdraw this application.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Delete Application
  |--------------------------------------------------------------------------
  */

  await application.deleteOne();

  return;
};