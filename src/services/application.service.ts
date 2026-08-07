import Application from "../models/application.model";
import Job from "../models/job.model";
import User from "../models/user.model";
import CandidateProfile from "../models/candidate-profile.model";
import {
  sendJobApplicationApplicantEmail,
  sendJobApplicationRecruiterEmail,
} from "./email.service";

import { AppError } from "../utils/app-error";

import { HTTP_STATUS } from "../constants/http-status";
import {
  APPLICATION_STATUS,
  ApplicationStatus,
} from "../constants/application-status";
import { JOB_STATUS } from "../constants/job-status";
import { createNotification } from "./notification.service";
import { NOTIFICATION_TYPES } from "../constants/notification-type";


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
  /* Check Company Verification                                                  */
  /* -------------------------------------------------------------------------- */

  const Company = (await import("../models/company.model")).default;
  let company = null;
  if (job.companyId) {
    company = await Company.findById(job.companyId);
  }
  if (!company && job.recruiterId) {
    company = await Company.findOne({ recruiterId: job.recruiterId });
  }

  if (company && company.isVerified === false) {
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
    "name email resumeUrl isBlocked"
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
    candidateProfileId: candidateProfile?._id,
    resume: activeResumeUrl,
    coverLetter: applicationData.coverLetter,
    status: APPLICATION_STATUS.APPLIED,
  });

  await application.populate({
    path: "jobId",
    select: "title company location salaryMin salaryMax employmentType experienceLevel status skills",
  });

  try {
    const companyName = company?.name || job.company || "JobsBox Partner";

    // Candidate real-time notification
    await createNotification({
      recipientId: applicantId,
      senderId: job.recruiterId?.toString() || null,
      type: NOTIFICATION_TYPES.APPLICATION_UPDATE,
      title: "Application Submitted Successfully 🎉",
      body: `You have successfully applied for "${job.title}" at ${companyName}.`,
      link: `/candidate/applied`,
      metadata: {
        jobId: job._id.toString(),
        applicationId: application._id.toString(),
      },
    });

    // Recruiter real-time notification
    if (job.recruiterId) {
      await createNotification({
        recipientId: job.recruiterId.toString(),
        senderId: applicantId,
        type: NOTIFICATION_TYPES.APPLICATION_UPDATE,
        title: "New Job Application Received",
        body: `A new candidate submitted an application for "${job.title}".`,
        link: `/recruiter/applicants`,
        metadata: {
          jobId: job._id.toString(),
          applicationId: application._id.toString(),
        },
      });
    }
  } catch (err) {
    console.error("Failed to send real-time notification on job application:", err);
  }

  /* -------------------------------------------------------------------------- */
  /* Dispatch SMTP Email Notifications                                           */
  /* -------------------------------------------------------------------------- */

  try {
    const companyName = company?.name || job.company || "JobsBox Partner";
    
    // Fetch recruiter user details
    const recruiterUser = await User.findById(job.recruiterId).select("name email").lean();

    // Dispatch emails concurrently
    const emailPromises: Promise<any>[] = [];

    if (candidate.email) {
      emailPromises.push(
        sendJobApplicationApplicantEmail({
          applicantName: candidate.name || "Candidate",
          applicantEmail: candidate.email,
          jobTitle: job.title,
          companyName,
          jobId: job._id.toString(),
          applicationId: application._id.toString(),
        })
      );
    } else {
      console.warn(`[SMTP WARN] Candidate (ID: ${applicantId}) does not have an email address attached in DB.`);
    }

    if (recruiterUser?.email) {
      emailPromises.push(
        sendJobApplicationRecruiterEmail({
          recruiterName: recruiterUser.name || "Recruiter",
          recruiterEmail: recruiterUser.email,
          applicantName: candidate.name || "Candidate",
          applicantEmail: candidate.email || "",
          jobTitle: job.title,
          companyName,
          coverLetter: applicationData.coverLetter,
          resumeUrl: activeResumeUrl,
          jobId: job._id.toString(),
          applicationId: application._id.toString(),
        })
      );
    } else {
      console.warn(`[SMTP WARN] Recruiter (ID: ${job.recruiterId}) does not have an email address attached in DB.`);
    }

    await Promise.allSettled(emailPromises);
  } catch (err) {
    console.error("Failed to dispatch application emails via SMTP:", err);
  }



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

    const validApplications = applications.filter(
      (app) => app.jobId !== null && app.jobId !== undefined
    );

    return buildPaginatedResult(validApplications, totalItems, page, limit);
  }

  const applications = await Application.find(query)
    .populate({
      path: "jobId",
      select:
        "title company location salaryMin salaryMax employmentType experienceLevel status",
    })
    .sort(sortOptions)
    .lean();

  const validApplications = applications.filter(
    (app) => app.jobId !== null && app.jobId !== undefined
  );

  return validApplications;
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
  | Status Transition Checks & Normalization
  |--------------------------------------------------------------------------
  */

  const normalizedStatusMap: Record<string, string> = {
    applied: APPLICATION_STATUS.APPLIED,
    "under review": APPLICATION_STATUS.UNDER_REVIEW,
    under_review: APPLICATION_STATUS.UNDER_REVIEW,
    shortlisted: APPLICATION_STATUS.SHORTLISTED,
    interview: APPLICATION_STATUS.INTERVIEW,
    rejected: APPLICATION_STATUS.REJECTED,
    hired: APPLICATION_STATUS.HIRED,
  };

  const targetStatus =
    normalizedStatusMap[status.toLowerCase()] || status;

  if (
    application.status === APPLICATION_STATUS.HIRED ||
    application.status === APPLICATION_STATUS.REJECTED
  ) {
    if (application.status === targetStatus) {
      return application;
    }
    throw new AppError(
      "Cannot change status of a finalized application.",
      HTTP_STATUS.CONFLICT
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Update Status
  |--------------------------------------------------------------------------
  */

  application.status = targetStatus as ApplicationStatus;

  await application.save();

  try {
    if (application.applicantId) {
      let notifTitle = "Application Status Updated";
      let notifBody = `Your application status for "${job.title}" has been updated to ${targetStatus}.`;

      switch (targetStatus) {
        case APPLICATION_STATUS.UNDER_REVIEW:
          notifTitle = "Application Reviewed 👁️";
          notifBody = `A recruiter reviewed your application for "${job.title}".`;
          break;
        case APPLICATION_STATUS.SHORTLISTED:
          notifTitle = "Application Shortlisted ⭐";
          notifBody = `Great news! Your application for "${job.title}" has been shortlisted.`;
          break;
        case APPLICATION_STATUS.INTERVIEW:
          notifTitle = "Interview Invitation 📅";
          notifBody = `A recruiter scheduled an interview for your application to "${job.title}".`;
          break;
        case APPLICATION_STATUS.HIRED:
          notifTitle = "Job Offer Received 🎉";
          notifBody = `Congratulations! You have received a job offer for "${job.title}".`;
          break;
        case APPLICATION_STATUS.REJECTED:
          notifTitle = "Application Update 📋";
          notifBody = `Your application status for "${job.title}" has been updated.`;
          break;
      }

      await createNotification({
        recipientId: application.applicantId.toString(),
        senderId: recruiterId,
        type: NOTIFICATION_TYPES.APPLICATION_UPDATE,
        title: notifTitle,
        body: notifBody,
        link: `/candidate/applied`,
        metadata: {
          jobId: job._id.toString(),
          applicationId: application._id.toString(),
          status: targetStatus,
        },
      });
    }
  } catch (err) {
    console.error("Failed to send real-time notification on application status update:", err);
  }

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