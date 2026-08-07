import Application from "../models/application.model";
import Job from "../models/job.model";
import User from "../models/user.model";
import CandidateProfile from "../models/candidate-profile.model";

import { AppError } from "../utils/app-error";

import { HTTP_STATUS } from "../constants/http-status";
import {
  APPLICATION_STATUS,
  ApplicationStatus,
} from "../constants/application-status";
import { JOB_STATUS } from "../constants/job-status";


import {
  getPaginationOptions,
  buildPaginatedResult,
} from "../utils/pagination";

interface ApplyJobInput {
  coverLetter?: string;
}

interface ApplicationFilters {
  page?: string;
  limit?: string;
  sort?: string;
  status?: ApplicationStatus;
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
  /* Check Company Verification                                                  */
  /* -------------------------------------------------------------------------- */

  const Company = (await import("../models/company.model")).default;
  const company = await Company.findOne({ recruiterId: job.recruiterId });

  if (!company || !company.isVerified) {
    throw new AppError(
      "This company is not accepting applications.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Prevent Self Application                                                    */
  /* -------------------------------------------------------------------------- */

  if (job.recruiterId.toString() === applicantId) {
    throw new AppError(
      "Recruiters cannot apply to their own jobs.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Check Candidate Exists & Is Not Blocked                                    */
  /* -------------------------------------------------------------------------- */

  const candidate = await User.findById(applicantId).select(
    "resumeUrl isBlocked"
  );

  if (!candidate) {
    throw new AppError(
      "User not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  if (candidate.isBlocked) {
    throw new AppError(
      "Your account has been blocked.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Resume Check (CandidateProfile Source of Truth with User Fallback)           */
  /* -------------------------------------------------------------------------- */

  const candidateProfile = await CandidateProfile.findOne({
    userId: applicantId,
  })
    .select("resumeUrl")
    .lean();

  const activeResumeUrl = candidateProfile?.resumeUrl || candidate.resumeUrl;

  if (!activeResumeUrl) {
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
    resume: activeResumeUrl,
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
  applicantId: string,
  filters: ApplicationFilters = {}
) => {
  const query: Record<string, unknown> = {
    applicantId,
  };

  if (filters.status) {
    query.status = filters.status;
  }

  const sortOptions: Record<string, 1 | -1> =
    filters.sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

  if (filters.page || filters.limit) {
    const { page, limit, skip } = getPaginationOptions(filters);

    const [applications, totalItems] = await Promise.all([
      Application.find(query)
        .populate({
          path: "jobId",
          select:
            "title company location salaryMin salaryMax employmentType experienceLevel status",
        })
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      Application.countDocuments(query),
    ]);

    return buildPaginatedResult(applications, totalItems, page, limit);
  }

  const applications = await Application.find(query)
    .populate({
      path: "jobId",
      select:
        "title company location salaryMin salaryMax employmentType experienceLevel status",
    })
    .sort(sortOptions)
    .lean();

  return applications;
};

/*
|--------------------------------------------------------------------------
| Get Applications For Job
|--------------------------------------------------------------------------
*/

export const getJobApplications = async (
  jobId: string,
  recruiterId: string,
  filters: ApplicationFilters = {}
) => {
  /*
  |--------------------------------------------------------------------------
  | Check Job Exists
  |--------------------------------------------------------------------------
  */

  const job = await Job.findById(jobId).lean();

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

  const query: Record<string, unknown> = {
    jobId,
  };

  if (filters.status) {
    query.status = filters.status;
  }

  const sortOptions: Record<string, 1 | -1> =
    filters.sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

  if (filters.page || filters.limit) {
    const { page, limit, skip } = getPaginationOptions(filters);

    const [applications, totalItems] = await Promise.all([
      Application.find(query)
        .populate({
          path: "applicantId",
          select: "name email phone resumeUrl",
        })
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      Application.countDocuments(query),
    ]);

    return buildPaginatedResult(applications, totalItems, page, limit);
  }

  const applications = await Application.find(query)
    .populate({
      path: "applicantId",
      select: "name email phone resumeUrl",
    })
    .sort(sortOptions)
    .lean();

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
  | Status Transition Checks
  |--------------------------------------------------------------------------
  */

  if (
    application.status === APPLICATION_STATUS.HIRED ||
    application.status === APPLICATION_STATUS.REJECTED
  ) {
    throw new AppError(
      "Cannot change status of a finalized application.",
      HTTP_STATUS.CONFLICT
    );
  }

  const validTransitions: Record<string, string[]> = {
    [APPLICATION_STATUS.APPLIED]: [
      APPLICATION_STATUS.SHORTLISTED,
      APPLICATION_STATUS.INTERVIEW,
      APPLICATION_STATUS.REJECTED,
      APPLICATION_STATUS.HIRED,
    ],
    [APPLICATION_STATUS.SHORTLISTED]: [
      APPLICATION_STATUS.INTERVIEW,
      APPLICATION_STATUS.REJECTED,
      APPLICATION_STATUS.HIRED,
    ],
    [APPLICATION_STATUS.INTERVIEW]: [
      APPLICATION_STATUS.REJECTED,
      APPLICATION_STATUS.HIRED,
    ],
  };

  const allowedNext = validTransitions[application.status] || [];
  if (!allowedNext.includes(status)) {
    throw new AppError(
      "Invalid application status transition.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Update Status
  |--------------------------------------------------------------------------
  */

  application.status = status as ApplicationStatus;

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
  | Check Active Status
  |--------------------------------------------------------------------------
  */

  if (
    application.status === APPLICATION_STATUS.HIRED ||
    application.status === APPLICATION_STATUS.REJECTED
  ) {
    throw new AppError(
      "This application can no longer be withdrawn.",
      HTTP_STATUS.CONFLICT
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