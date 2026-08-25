import Application from "../models/application.model";
import Job from "../models/job.model";
import User from "../models/user.model";
import CandidateProfile from "../models/candidate-profile.model";
import { getAuthorizedCompanyForRecruiter } from "./company.service";
import {
  sendJobApplicationApplicantEmail,
  sendJobApplicationRecruiterEmail,
  sendApplicationStatusUpdateEmail,
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
  applicantName?: string;
  applicantPhone?: string;
  applicantDesignation?: string;
  experienceYears?: number;
  relevantSkills?: string[];
  noticePeriod?: string;
  resumeUrl?: string;
  resumePublicId?: string;
  resumeFileName?: string;
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
*/

export const applyForJob = async (
  jobId: string,
  applicantId: string,
  applicationData: ApplyJobInput
) => {
  /* -------------------------------------------------------------------------- */
  /* Check Job Exists & Is Not Deleted                                         */
  /* -------------------------------------------------------------------------- */

  const job = await Job.findOne({ _id: jobId, isDeleted: false });

  if (!job) {
    throw new AppError(
      "Job not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Job Status & Expiry Check                                                  */
  /* -------------------------------------------------------------------------- */

  if (job.status !== JOB_STATUS.ACTIVE) {
    throw new AppError(
      "This job is not accepting applications.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (job.expiresAt && new Date(job.expiresAt) < new Date()) {
    throw new AppError(
      "This job listing has expired.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Check Recruiter Account Is Active & Not Blocked                           */
  /* -------------------------------------------------------------------------- */

  const recruiterUser = await User.findById(job.recruiterId).select("name email isBlocked status").lean();

  if (!recruiterUser || (recruiterUser as any).isBlocked) {
    throw new AppError(
      "This job posting is no longer available.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Check Company Verification                                                  */
  /* -------------------------------------------------------------------------- */

  const Company = (await import("../models/company.model")).default;
  let company = null;
  if (job.companyId) {
    company = await Company.findOne({ _id: job.companyId, isDeleted: false });
  }
  if (!company && job.recruiterId) {
    company = await Company.findOne({ recruiterId: job.recruiterId, isDeleted: false });
  }

  if (company && company.isVerified === false) {
    throw new AppError(
      "This company is not accepting applications.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Prevent Self Application & Company Team Application                         */
  /* -------------------------------------------------------------------------- */

  if (job.recruiterId.toString() === applicantId) {
    throw new AppError(
      "Recruiters cannot apply to their own jobs.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  if (job.companyId) {
    const RecruiterProfile = (await import("../models/recruiter-profile.model")).default;
    const CompanyRecruiter = (await import("../models/company-recruiter.model")).default;
    const applicantRecruiterProfile = await RecruiterProfile.findOne({ userId: applicantId });
    if (applicantRecruiterProfile) {
      const isCompanyMember = await CompanyRecruiter.findOne({
        companyId: job.companyId,
        recruiterProfileId: applicantRecruiterProfile._id,
        isDeleted: false,
      });
      if (isCompanyMember) {
        throw new AppError(
          "Company team members cannot apply to their own company's jobs.",
          HTTP_STATUS.FORBIDDEN
        );
      }
    }
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
  /* Resume Check & Profile Invariant (CandidateProfile Source of Truth)        */
  /* -------------------------------------------------------------------------- */

  let candidateProfile = await CandidateProfile.findOne({
    userId: applicantId,
  });

  if (!candidateProfile) {
    candidateProfile = await CandidateProfile.create({
      userId: applicantId,
    });
  }

  if (candidateProfile.userId.toString() !== applicantId.toString()) {
    throw new AppError(
      "Candidate profile ownership mismatch.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  const activeResumeUrl = applicationData.resumeUrl || candidateProfile?.resumeUrl || candidate.resumeUrl;
  const activeResumePublicId = applicationData.resumePublicId || candidateProfile?.resumePublicId;
  const activeResumeFileName = applicationData.resumeFileName || candidateProfile?.resumeFileName || "Resume.pdf";

  if (!activeResumeUrl) {
    throw new AppError(
      "Please select or upload a resume before applying.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Check / Revive Existing Application or Insert with Race Protection          */
  /* -------------------------------------------------------------------------- */

  let application = await Application.findOne({
    jobId,
    applicantId,
  });

  if (application) {
    if (!application.isDeleted) {
      throw new AppError(
        "You have already applied for this job.",
        HTTP_STATUS.CONFLICT
      );
    }

    // Candidate previously withdrew; revive application with fresh details
    application.isDeleted = false;
    application.candidateProfileId = candidateProfile._id;
    application.applicantName = applicationData.applicantName || candidate.name;
    application.applicantEmail = candidate.email;
    application.applicantPhone = applicationData.applicantPhone || candidateProfile?.phone || (candidate as any).phone || "";
    application.applicantDesignation = applicationData.applicantDesignation || candidateProfile?.headline || "";
    application.experienceYears = typeof applicationData.experienceYears === "number" ? applicationData.experienceYears : 0;
    application.relevantSkills = applicationData.relevantSkills || candidateProfile?.skills || [];
    application.noticePeriod = applicationData.noticePeriod || "";
    application.resume = activeResumeUrl;
    application.resumePublicId = activeResumePublicId;
    application.resumeFileName = activeResumeFileName;
    application.coverLetter = applicationData.coverLetter;
    application.status = APPLICATION_STATUS.APPLIED;
    application.interviewDetails = undefined;
    await application.save();
  } else {
    try {
      application = await Application.create({
        jobId,
        applicantId,
        candidateProfileId: candidateProfile._id,
        applicantName: applicationData.applicantName || candidate.name,
        applicantEmail: candidate.email,
        applicantPhone: applicationData.applicantPhone || candidateProfile?.phone || (candidate as any).phone || "",
        applicantDesignation: applicationData.applicantDesignation || candidateProfile?.headline || "",
        experienceYears: typeof applicationData.experienceYears === "number" ? applicationData.experienceYears : 0,
        relevantSkills: applicationData.relevantSkills || candidateProfile?.skills || [],
        noticePeriod: applicationData.noticePeriod || "",
        resume: activeResumeUrl,
        resumePublicId: activeResumePublicId,
        resumeFileName: activeResumeFileName,
        coverLetter: applicationData.coverLetter,
        status: APPLICATION_STATUS.APPLIED,
        isDeleted: false,
      });
    } catch (err: any) {
      if (err.code === 11000 || err.name === "MongoServerError" || err.message?.includes("E11000")) {
        throw new AppError(
          "You have already applied for this job.",
          HTTP_STATUS.CONFLICT
        );
      }
      throw err;
    }
  }

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
    }

    void Promise.allSettled(emailPromises).catch((err) => {
      console.error("Failed to dispatch application emails via SMTP:", err);
    });
  } catch (err) {
    console.error("Failed to prepare application emails:", err);
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
    isDeleted: false,
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
| Get Applications For Job (Recruiter & Authorized Company Teammates)
|--------------------------------------------------------------------------
*/

export const getJobApplications = async (
  jobId: string,
  recruiterId: string,
  filters: ApplicationFilters = {}
) => {
  const job = await Job.findOne({ _id: jobId, isDeleted: false }).lean();

  if (!job) {
    throw new AppError(
      "Job not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  const auth = await getAuthorizedCompanyForRecruiter(recruiterId);
  const isDirectOwner = job.recruiterId.toString() === recruiterId;
  const isCompanyTeammate = Boolean(
    auth && job.companyId && auth.company._id.toString() === job.companyId.toString()
  );

  if (!isDirectOwner && !isCompanyTeammate) {
    throw new AppError(
      "You are not authorized to view these applications.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  const query: Record<string, unknown> = {
    jobId,
    isDeleted: false,
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
| Get All Recruiter Applications (Across All Owned & Company Posted Jobs)
|--------------------------------------------------------------------------
*/
export const getRecruiterApplications = async (
  recruiterId: string,
  filters: ApplicationFilters = {}
) => {
  const Job = (await import("../models/job.model")).default;
  const auth = await getAuthorizedCompanyForRecruiter(recruiterId);

  let jobQuery: Record<string, unknown> = {
    recruiterId,
    isDeleted: false,
  };

  if (auth?.company?._id) {
    jobQuery = {
      $or: [{ recruiterId }, { companyId: auth.company._id }],
      isDeleted: false,
    };
  }

  const recruiterJobs = await Job.find(jobQuery).select("_id title").lean();
  const jobIds = recruiterJobs.map((j) => j._id);
  const jobTitleMap = new Map<string, string>();
  recruiterJobs.forEach((j) => jobTitleMap.set(j._id.toString(), j.title));

  const query: Record<string, unknown> = {
    jobId: { $in: jobIds },
    isDeleted: false,
  };

  if (filters.status) {
    query.status = filters.status;
  }

  const applications = await Application.find(query)
    .populate({
      path: "jobId",
      select: "title company location salaryMin salaryMax employmentType experienceLevel status",
    })
    .populate({
      path: "applicantId",
      select: "name email phone resumeUrl",
    })
    .sort({ createdAt: -1 })
    .lean();

  const formattedApplications = applications.map((app) => {
    const rawJobId = app.jobId
      ? typeof app.jobId === "object"
        ? (app.jobId as any)._id?.toString() || ""
        : String(app.jobId)
      : "";

    const jobTitle =
      (app.jobId as any)?.title ||
      jobTitleMap.get(rawJobId || "") ||
      "Job Application";

    return {
      ...app,
      jobTitle,
    };
  });

  return formattedApplications;
};

/*
|--------------------------------------------------------------------------
| Update Application Status
|--------------------------------------------------------------------------
*/

export const updateApplicationStatus = async (
  applicationId: string,
  recruiterId: string,
  status: string,
  interviewDetails?: any
) => {
  const application = await Application.findOne({
    _id: applicationId,
    isDeleted: false,
  });

  if (!application) {
    throw new AppError(
      "Application not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  const job = await Job.findOne({ _id: application.jobId, isDeleted: false });

  if (!job) {
    throw new AppError(
      "Job not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  const auth = await getAuthorizedCompanyForRecruiter(recruiterId);
  const isDirectOwner = job.recruiterId.toString() === recruiterId;
  const isCompanyTeammate = Boolean(
    auth && job.companyId && auth.company._id.toString() === job.companyId.toString()
  );

  if (!isDirectOwner && !isCompanyTeammate) {
    throw new AppError(
      "You are not authorized to update this application.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Status Transition Checks & Normalization                                   */
  /* -------------------------------------------------------------------------- */

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
    typeof status === "string"
      ? normalizedStatusMap[status.toLowerCase()] || status
      : status;

  if (application.status === targetStatus) {
    if (targetStatus === APPLICATION_STATUS.INTERVIEW && interviewDetails) {
      application.interviewDetails = interviewDetails;
      await application.save();
    }
    return application;
  }

  if (
    application.status === APPLICATION_STATUS.HIRED ||
    application.status === APPLICATION_STATUS.REJECTED
  ) {
    throw new AppError(
      "Cannot change status of a finalized application.",
      HTTP_STATUS.CONFLICT
    );
  }

  // Proper State-Machine Transition Matrix
  const VALID_TRANSITIONS: Record<string, string[]> = {
    [APPLICATION_STATUS.APPLIED]: [
      APPLICATION_STATUS.UNDER_REVIEW,
      APPLICATION_STATUS.SHORTLISTED,
      APPLICATION_STATUS.REJECTED,
    ],
    [APPLICATION_STATUS.UNDER_REVIEW]: [
      APPLICATION_STATUS.SHORTLISTED,
      APPLICATION_STATUS.INTERVIEW,
      APPLICATION_STATUS.REJECTED,
    ],
    [APPLICATION_STATUS.SHORTLISTED]: [
      APPLICATION_STATUS.INTERVIEW,
      APPLICATION_STATUS.REJECTED,
    ],
    [APPLICATION_STATUS.INTERVIEW]: [
      APPLICATION_STATUS.HIRED,
      APPLICATION_STATUS.REJECTED,
    ],
  };

  const allowedNext = VALID_TRANSITIONS[application.status] || [];
  if (!allowedNext.includes(targetStatus)) {
    throw new AppError(
      `Cannot transition application status from "${application.status}" to "${targetStatus}".`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // Validate required interview details when transitioning to INTERVIEW
  if (targetStatus === APPLICATION_STATUS.INTERVIEW) {
    if (
      !interviewDetails ||
      typeof interviewDetails !== "object" ||
      !interviewDetails.date?.trim() ||
      !interviewDetails.time?.trim()
    ) {
      throw new AppError(
        "Interview date and time are required when scheduling an interview.",
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Update Status & Interview Details                                          */
  /* -------------------------------------------------------------------------- */

  application.status = targetStatus as ApplicationStatus;
  if (interviewDetails) {
    application.interviewDetails = interviewDetails;
  }

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
          notifTitle = "Interview Scheduled 📅";
          const modeLabel = interviewDetails?.mode === "in-person"
            ? "In-Person On-Site"
            : interviewDetails?.mode === "phone"
            ? "Phone Call"
            : "Video Call";
          const whenStr = interviewDetails?.date ? ` on ${interviewDetails.date} at ${interviewDetails.time || ""}` : "";
          notifBody = `An interview (${modeLabel}) was scheduled for "${job.title}"${whenStr}.`;
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

      // Dispatch SMTP Email to Candidate regarding status update
      const candidateUser = await User.findById(application.applicantId)
        .select("name email")
        .lean();

      if (candidateUser && candidateUser.email) {
        const companyName = job.company || "JobsBox Partner";
        void sendApplicationStatusUpdateEmail({
          applicantName: candidateUser.name || "Candidate",
          applicantEmail: candidateUser.email,
          jobTitle: job.title,
          companyName,
          status: targetStatus,
          applicationId: application._id.toString(),
        });
      }
    }
  } catch (err) {
    console.error("Failed to send notification or email on application status update:", err);
  }

  return application;
};

/*
|--------------------------------------------------------------------------
| Withdraw Application (Soft Delete)
|--------------------------------------------------------------------------
*/

export const withdrawApplication = async (
  applicationId: string,
  applicantId: string
) => {
  const application = await Application.findOne({
    _id: applicationId,
    isDeleted: false,
  });

  if (!application) {
    throw new AppError(
      "Application not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  if (application.applicantId.toString() !== applicantId) {
    throw new AppError(
      "You are not authorized to withdraw this application.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  if (
    application.status === APPLICATION_STATUS.HIRED ||
    application.status === APPLICATION_STATUS.REJECTED
  ) {
    throw new AppError(
      "This application can no longer be withdrawn.",
      HTTP_STATUS.CONFLICT
    );
  }

  // Soft Delete application preserving historical records
  application.isDeleted = true;
  await application.save();

  return;
};