import mongoose, { Types } from "mongoose";
import Application from "../models/application.model";
import ApplicationStatusHistory from "../models/application-status-history.model";
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
import {
  normalizeApplicationStatus,
  isValidStatusTransition,
  isTerminalApplicationStatus,
} from "../constants/application-transitions";
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

export interface UpdateStatusOptions {
  reason?: string;
  interviewDetails?: {
    mode?: "video" | "in-person" | "phone";
    date?: string;
    time?: string;
    type?: string;
    locationOrLink?: string;
    notes?: string;
  };
  metadata?: Record<string, any>;
  [key: string]: any;
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
| Update Application Status (ATS Centralized Transition Engine)
|--------------------------------------------------------------------------
*/

export const updateApplicationStatus = async (
  applicationId: string,
  recruiterId: string,
  statusInput: string,
  optionsOrDetails?: any
) => {
  if (!Types.ObjectId.isValid(applicationId)) {
    throw new AppError(
      "Invalid application ID.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const normalizedTargetStatus = normalizeApplicationStatus(statusInput);
  if (!normalizedTargetStatus) {
    throw new AppError(
      `Invalid application status: "${statusInput}".`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

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

  /* -------------------------------------------------------------------------- */
  /* Recruiter Authorization Verification                                       */
  /* -------------------------------------------------------------------------- */

  const auth = await getAuthorizedCompanyForRecruiter(recruiterId);
  const isDirectOwner = job.recruiterId.toString() === recruiterId;
  const isCompanyTeammate = Boolean(
    auth && job.companyId && auth.company._id.toString() === job.companyId.toString()
  );

  const recruiterUser = await User.findById(recruiterId).select("role").lean();
  const isAdmin = recruiterUser?.role === "admin";

  if (!isDirectOwner && !isCompanyTeammate && !isAdmin) {
    throw new AppError(
      "You are not authorized to update this application.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  /* -------------------------------------------------------------------------- */
  /* Parse Options & Legacy Interview Details                                    */
  /* -------------------------------------------------------------------------- */

  let options: UpdateStatusOptions = {};
  if (optionsOrDetails && typeof optionsOrDetails === "object") {
    if (
      optionsOrDetails.mode ||
      optionsOrDetails.date ||
      optionsOrDetails.time ||
      optionsOrDetails.type ||
      optionsOrDetails.locationOrLink
    ) {
      options = { interviewDetails: optionsOrDetails };
    } else {
      options = optionsOrDetails;
    }
  }

  const { interviewDetails, reason, metadata } = options;
  const currentStatus = application.status;

  /* -------------------------------------------------------------------------- */
  /* Idempotent No-Op Status Check                                              */
  /* -------------------------------------------------------------------------- */

  if (currentStatus === normalizedTargetStatus) {
    if (normalizedTargetStatus === APPLICATION_STATUS.INTERVIEW && interviewDetails) {
      application.interviewDetails = interviewDetails;
      await application.save();
    }
    return application;
  }

  /* -------------------------------------------------------------------------- */
  /* Terminal Status & Centralized State-Machine Transition Policy              */
  /* -------------------------------------------------------------------------- */

  if (isTerminalApplicationStatus(currentStatus)) {
    throw new AppError(
      `Cannot change status of a finalized application from "${currentStatus}".`,
      HTTP_STATUS.CONFLICT
    );
  }

  if (!isValidStatusTransition(currentStatus, normalizedTargetStatus)) {
    throw new AppError(
      `Cannot transition application status from "${currentStatus}" to "${normalizedTargetStatus}".`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // Validate required interview details when transitioning to INTERVIEW
  if (normalizedTargetStatus === APPLICATION_STATUS.INTERVIEW) {
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
  /* Atomic Transaction Execution with Optimistic Concurrency Protection         */
  /* -------------------------------------------------------------------------- */

  let updatedApp: any = null;
  let historyRecord: any = null;

  let session: mongoose.ClientSession | null = null;
  let useTransaction = true;

  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch (_e) {
    // If standalone MongoDB does not support transactions, gracefully fall back
    useTransaction = false;
    if (session) {
      await session.endSession().catch(() => {});
      session = null;
    }
  }

  try {
    const updatePayload: Record<string, any> = {
      $set: {
        status: normalizedTargetStatus,
        ...(interviewDetails ? { interviewDetails } : {}),
      },
    };

    const sessionOption = useTransaction && session ? { session, returnDocument: "after" as const } : { returnDocument: "after" as const };

    // Concurrency Lock: only update if document status matches the verified currentStatus
    updatedApp = await Application.findOneAndUpdate(
      {
        _id: applicationId,
        status: currentStatus,
        isDeleted: false,
      },
      updatePayload,
      sessionOption
    );

    if (!updatedApp) {
      // Status was changed concurrently by another recruiter/process
      throw new AppError(
        "Application status was modified by another session. Please refresh and try again.",
        HTTP_STATUS.CONFLICT
      );
    }

    // Atomic History Creation
    const historyPayload = {
      applicationId: updatedApp._id,
      jobId: updatedApp.jobId,
      fromStatus: currentStatus,
      toStatus: normalizedTargetStatus,
      changedBy: new Types.ObjectId(recruiterId),
      reason: reason || undefined,
      metadata: metadata || (interviewDetails ? { interviewDetails } : undefined),
    };

    if (useTransaction && session) {
      const createdHistoryDocs = await ApplicationStatusHistory.create([historyPayload], { session });
      historyRecord = createdHistoryDocs[0];
      await session.commitTransaction();
    } else {
      historyRecord = await ApplicationStatusHistory.create(historyPayload);
    }
  } catch (error) {
    if (useTransaction && session) {
      await session.abortTransaction().catch(() => {});
    }
    throw error;
  } finally {
    if (session) {
      await session.endSession().catch(() => {});
    }
  }

  /* -------------------------------------------------------------------------- */
  /* Real-Time ATS WebSocket Synchronization Event Dispatch                      */
  /* -------------------------------------------------------------------------- */

  try {
    const { emitApplicationStatusChanged } = await import("../config/socket");
    emitApplicationStatusChanged({
      applicationId: updatedApp._id.toString(),
      jobId: job._id.toString(),
      companyId: job.companyId ? job.companyId.toString() : undefined,
      fromStatus: currentStatus,
      toStatus: normalizedTargetStatus,
      changedBy: recruiterId,
      updatedAt: updatedApp.updatedAt ? new Date(updatedApp.updatedAt).toISOString() : new Date().toISOString(),
      metadata: metadata || (interviewDetails ? { interviewDetails } : undefined),
    });
  } catch (socketErr) {
    console.error("Failed to emit real-time ATS status event:", socketErr);
  }

  /* -------------------------------------------------------------------------- */
  /* Post-Commit Asynchronous Real-Time Notification & Email Dispatch           */
  /* -------------------------------------------------------------------------- */

  try {
    if (updatedApp.applicantId) {
      const NOTIFY_CANDIDATE_STATUSES = [
        APPLICATION_STATUS.UNDER_REVIEW,
        APPLICATION_STATUS.SHORTLISTED,
        APPLICATION_STATUS.INTERVIEW,
        APPLICATION_STATUS.HIRED,
        APPLICATION_STATUS.REJECTED,
      ];

      if (NOTIFY_CANDIDATE_STATUSES.includes(normalizedTargetStatus as any)) {
        let notifTitle = "Application Status Updated";
        let notifBody = `Your application status for "${job.title}" has been updated to ${normalizedTargetStatus}.`;

        switch (normalizedTargetStatus) {
          case APPLICATION_STATUS.UNDER_REVIEW:
            notifTitle = "Application Under Review 👁️";
            notifBody = `A recruiter is currently reviewing your application for "${job.title}".`;
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
            notifBody = `Congratulations! You have been hired for "${job.title}".`;
            break;
          case APPLICATION_STATUS.REJECTED:
            notifTitle = "Application Update 📋";
            notifBody = `Your application status for "${job.title}" has been updated.`;
            break;
        }

        const NotificationModel = (await import("../models/notification.model")).default;
        
        // Idempotency check: prevent duplicate notifications within recent 10-minute window
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const existingRecentNotification = await NotificationModel.findOne({
          recipientId: updatedApp.applicantId,
          type: NOTIFICATION_TYPES.APPLICATION_UPDATE,
          "metadata.applicationId": updatedApp._id.toString(),
          "metadata.status": normalizedTargetStatus,
          createdAt: { $gte: tenMinutesAgo },
        }).lean();

        if (!existingRecentNotification) {
          await createNotification({
            recipientId: updatedApp.applicantId.toString(),
            senderId: recruiterId,
            type: NOTIFICATION_TYPES.APPLICATION_UPDATE,
            title: notifTitle,
            body: notifBody,
            link: `/candidate/applied`,
            metadata: {
              jobId: job._id.toString(),
              applicationId: updatedApp._id.toString(),
              status: normalizedTargetStatus,
            },
          });

          // Dispatch SMTP Email to Candidate regarding status update
          const candidateUser = await User.findById(updatedApp.applicantId)
            .select("name email")
            .lean();

          if (candidateUser && candidateUser.email) {
            const companyName = job.company || "JobsBox Partner";
            void sendApplicationStatusUpdateEmail({
              applicantName: candidateUser.name || "Candidate",
              applicantEmail: candidateUser.email,
              jobTitle: job.title,
              companyName,
              status: normalizedTargetStatus,
              applicationId: updatedApp._id.toString(),
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Failed to send notification or email on application status update:", err);
  }

  return updatedApp;
};

/*
|--------------------------------------------------------------------------
| Get Application Status History (Audit Trail)
|--------------------------------------------------------------------------
*/
export const getApplicationHistory = async (
  applicationId: string,
  requesterId: string,
  requesterRole: string
) => {
  if (!Types.ObjectId.isValid(applicationId)) {
    throw new AppError(
      "Invalid application ID.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

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

  // Authorization Check
  if (requesterRole === "candidate") {
    if (application.applicantId.toString() !== requesterId) {
      throw new AppError(
        "You are not authorized to view this application history.",
        HTTP_STATUS.FORBIDDEN
      );
    }
  } else if (requesterRole === "recruiter") {
    const auth = await getAuthorizedCompanyForRecruiter(requesterId);
    const isDirectOwner = job.recruiterId.toString() === requesterId;
    const isCompanyTeammate = Boolean(
      auth && job.companyId && auth.company._id.toString() === job.companyId.toString()
    );

    if (!isDirectOwner && !isCompanyTeammate) {
      throw new AppError(
        "You are not authorized to view this application history.",
        HTTP_STATUS.FORBIDDEN
      );
    }
  }

  const history = await ApplicationStatusHistory.find({
    applicationId: new Types.ObjectId(applicationId),
  })
    .populate("changedBy", "name email role profilePicture")
    .sort({ createdAt: -1 })
    .lean();

  return history;
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
