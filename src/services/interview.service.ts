import { Types } from "mongoose";
import Interview from "../models/interview.model";
import Application from "../models/application.model";
import Job from "../models/job.model";
import { getAuthorizedCompanyForRecruiter } from "./company.service";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { USER_ROLES } from "../constants/roles";
import { APPLICATION_STATUS } from "../constants/application-status";
import {
  INTERVIEW_STATUS,
  INTERVIEW_MODE,
  CANDIDATE_RSVP_STATUS,
  InterviewStatus,
  isValidInterviewTransition,
} from "../constants/interview-status";
import {
  IInterview,
  CreateInterviewInput,
  RescheduleInterviewInput,
  CandidateRsvpInput,
  SubmitFeedbackInput,
} from "../types/interview.types";
import {
  getPaginationOptions,
  buildPaginatedResult,
  PaginationParams,
  PaginationResult,
} from "../utils/pagination";

export interface InterviewFilters extends PaginationParams {
  status?: InterviewStatus;
  jobId?: string;
  candidateId?: string;
  applicationId?: string;
  from?: string;
  to?: string;
  sort?: "upcoming" | "recent" | "oldest";
}

/*
|--------------------------------------------------------------------------
| Internal Authorization & Verification Helpers
|--------------------------------------------------------------------------
*/

/**
 * Ineligible application statuses where new interviews cannot be scheduled.
 */
const INELIGIBLE_APPLICATION_STATUSES: readonly string[] = [
  APPLICATION_STATUS.REJECTED,
  APPLICATION_STATUS.HIRED,
];

/**
 * Verifies that the authenticated actor is authorized to manage interviews for a given Job.
 * Direct Job Owner, Verified Company Teammate, or Admin are permitted.
 */
export const verifyRecruiterJobAccess = async (
  jobId: Types.ObjectId | string,
  actorUserId: string,
  actorRole: string
) => {
  if (actorRole === USER_ROLES.ADMIN) {
    const adminJob = await Job.findOne({ _id: jobId, isDeleted: false }).lean();
    if (!adminJob) {
      throw new AppError("Job not found.", HTTP_STATUS.NOT_FOUND);
    }
    return adminJob;
  }

  if (actorRole !== USER_ROLES.RECRUITER) {
    throw new AppError(
      "Only recruiters and administrators are authorized to manage interviews.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  const job = await Job.findOne({ _id: jobId, isDeleted: false }).lean();
  if (!job) {
    throw new AppError("Job not found.", HTTP_STATUS.NOT_FOUND);
  }

  const isDirectOwner = job.recruiterId.toString() === actorUserId;
  if (isDirectOwner) {
    return job;
  }

  // Check verified company teammate membership
  const auth = await getAuthorizedCompanyForRecruiter(actorUserId);
  const isCompanyTeammate = Boolean(
    auth &&
      job.companyId &&
      auth.company._id.toString() === job.companyId.toString()
  );

  if (!isCompanyTeammate) {
    throw new AppError(
      "You are not authorized to manage interviews for this job posting.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  return job;
};

/**
 * Validates that an Application is active and eligible for interview scheduling.
 */
export const checkApplicationEligibility = (application: {
  status: string;
  isDeleted: boolean;
}) => {
  if (application.isDeleted) {
    throw new AppError(
      "Cannot schedule interview for a deleted or withdrawn application.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (INELIGIBLE_APPLICATION_STATUSES.includes(application.status)) {
    throw new AppError(
      `Cannot schedule interview for application with finalized status "${application.status}".`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
};

/**
 * Checks for overlapping interview schedules for candidate and recruiter.
 */
export const checkSchedulingConflict = async (params: {
  candidateId: Types.ObjectId | string;
  recruiterId: Types.ObjectId | string;
  startTime: Date;
  endTime: Date;
  excludeInterviewId?: Types.ObjectId | string;
}) => {
  const { candidateId, recruiterId, startTime, endTime, excludeInterviewId } = params;

  const ACTIVE_INTERVIEW_STATUSES = [
    INTERVIEW_STATUS.SCHEDULED,
    INTERVIEW_STATUS.ACCEPTED,
    INTERVIEW_STATUS.RESCHEDULED,
  ];

  const baseQuery: Record<string, any> = {
    isDeleted: false,
    status: { $in: ACTIVE_INTERVIEW_STATUSES },
    scheduledStartTime: { $lt: endTime },
    scheduledEndTime: { $gt: startTime },
  };

  if (excludeInterviewId) {
    baseQuery._id = { $ne: new Types.ObjectId(excludeInterviewId.toString()) };
  }

  // 1. Check Recruiter Conflict
  const recruiterConflict = await Interview.findOne({
    ...baseQuery,
    recruiterId: new Types.ObjectId(recruiterId.toString()),
  })
    .select("_id roundNumber title scheduledStartTime scheduledEndTime")
    .lean();

  if (recruiterConflict) {
    throw new AppError(
      `Recruiter already has an active interview scheduled in this time window (${recruiterConflict.scheduledStartTime.toISOString()} to ${recruiterConflict.scheduledEndTime.toISOString()}).`,
      HTTP_STATUS.CONFLICT
    );
  }

  // 2. Check Candidate Conflict
  const candidateConflict = await Interview.findOne({
    ...baseQuery,
    candidateId: new Types.ObjectId(candidateId.toString()),
  })
    .select("_id roundNumber title scheduledStartTime scheduledEndTime")
    .lean();

  if (candidateConflict) {
    throw new AppError(
      `Candidate already has another interview scheduled in this time window (${candidateConflict.scheduledStartTime.toISOString()} to ${candidateConflict.scheduledEndTime.toISOString()}).`,
      HTTP_STATUS.CONFLICT
    );
  }
};

/*
|--------------------------------------------------------------------------
| 1. Create Interview
|--------------------------------------------------------------------------
*/
export const createInterview = async (
  input: CreateInterviewInput,
  actorUserId: string,
  actorRole: string
): Promise<IInterview> => {
  if (actorRole === USER_ROLES.CANDIDATE) {
    throw new AppError(
      "Candidates are not permitted to create interview schedules.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  const application = await Application.findOne({
    _id: input.applicationId,
    isDeleted: false,
  });

  if (!application) {
    throw new AppError("Application not found.", HTTP_STATUS.NOT_FOUND);
  }

  // Verify Application eligibility
  checkApplicationEligibility(application);

  // Verify Recruiter authorization on the Job
  await verifyRecruiterJobAccess(application.jobId, actorUserId, actorRole);

  // Parse and validate start time
  const startTime = new Date(input.scheduledStartTime);
  if (isNaN(startTime.getTime())) {
    throw new AppError(
      "Invalid scheduledStartTime format.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (startTime.getTime() < Date.now() - 60000) {
    throw new AppError(
      "Interview cannot be scheduled in the past.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const duration = input.durationMinutes && input.durationMinutes >= 5 ? input.durationMinutes : 45;
  const endTime = new Date(startTime.getTime() + duration * 60000);

  // Overlap conflict detection
  await checkSchedulingConflict({
    candidateId: application.applicantId,
    recruiterId: actorUserId,
    startTime,
    endTime,
  });

  // Calculate next sequential round number if not provided
  let roundNumber = input.roundNumber;
  if (!roundNumber || roundNumber < 1) {
    const existingCount = await Interview.countDocuments({
      applicationId: application._id,
      isDeleted: false,
    });
    roundNumber = existingCount + 1;
  }

  const interview = await Interview.create({
    applicationId: application._id,
    jobId: application.jobId,
    candidateId: application.applicantId,
    recruiterId: new Types.ObjectId(actorUserId),
    roundNumber,
    title: input.title?.trim() || `Round ${roundNumber}: ${input.type || "Technical Interview"}`,
    type: input.type?.trim() || "Technical Interview",
    mode: input.mode || INTERVIEW_MODE.VIDEO,
    scheduledStartTime: startTime,
    scheduledEndTime: endTime,
    durationMinutes: duration,
    timezone: input.timezone?.trim() || "UTC",
    locationOrLink: input.locationOrLink?.trim() || "",
    notes: input.notes?.trim() || "",
    status: INTERVIEW_STATUS.SCHEDULED,
    candidateResponse: {
      status: CANDIDATE_RSVP_STATUS.PENDING,
    },
    reminderSent24h: false,
    reminderSent1h: false,
    isDeleted: false,
  });

  return interview;
};

/*
|--------------------------------------------------------------------------
| 2. Get Interview By ID
|--------------------------------------------------------------------------
*/
export const getInterviewById = async (
  interviewId: string,
  actorUserId: string,
  actorRole: string
): Promise<IInterview> => {
  const interview = await Interview.findOne({
    _id: interviewId,
    isDeleted: false,
  })
    .populate("jobId", "title company location workMode companyId recruiterId")
    .populate("candidateId", "name email phone")
    .populate("recruiterId", "name email");

  if (!interview) {
    throw new AppError("Interview not found.", HTTP_STATUS.NOT_FOUND);
  }

  // Authorization Check
  if (actorRole === USER_ROLES.ADMIN) {
    return interview;
  }

  const candidateIdStr = (interview.candidateId as any)?._id
    ? (interview.candidateId as any)._id.toString()
    : interview.candidateId.toString();

  if (actorRole === USER_ROLES.CANDIDATE) {
    if (candidateIdStr !== actorUserId) {
      throw new AppError(
        "You are not authorized to view this interview.",
        HTTP_STATUS.FORBIDDEN
      );
    }
    return interview;
  }

  // Recruiter authorization
  const jobIdStr = (interview.jobId as any)?._id
    ? (interview.jobId as any)._id.toString()
    : interview.jobId.toString();

  await verifyRecruiterJobAccess(jobIdStr, actorUserId, actorRole);

  return interview;
};

/*
|--------------------------------------------------------------------------
| 3. List Interviews (Filtered & Paginated)
|--------------------------------------------------------------------------
*/
export const listInterviews = async (
  filters: InterviewFilters,
  actorUserId: string,
  actorRole: string
): Promise<PaginationResult<IInterview>> => {
  const { page, limit, skip } = getPaginationOptions(filters);
  const query: Record<string, any> = { isDeleted: false };

  // Role Scoping
  if (actorRole === USER_ROLES.CANDIDATE) {
    query.candidateId = new Types.ObjectId(actorUserId);
  } else if (actorRole === USER_ROLES.RECRUITER) {
    // By default, list interviews scheduled by or accessible to recruiter
    if (filters.jobId) {
      await verifyRecruiterJobAccess(filters.jobId, actorUserId, actorRole);
      query.jobId = new Types.ObjectId(filters.jobId);
    } else {
      query.recruiterId = new Types.ObjectId(actorUserId);
    }
  }

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.candidateId && actorRole !== USER_ROLES.CANDIDATE) {
    query.candidateId = new Types.ObjectId(filters.candidateId);
  }

  if (filters.applicationId) {
    query.applicationId = new Types.ObjectId(filters.applicationId);
  }

  // Date Range Filtering
  if (filters.from || filters.to) {
    query.scheduledStartTime = {};
    if (filters.from) {
      query.scheduledStartTime.$gte = new Date(filters.from);
    }
    if (filters.to) {
      query.scheduledStartTime.$lte = new Date(filters.to);
    }
  }

  const sortOptions: Record<string, any> = {};
  if (filters.sort === "recent") {
    sortOptions.createdAt = -1;
  } else if (filters.sort === "oldest") {
    sortOptions.scheduledStartTime = 1;
  } else {
    // Default 'upcoming': chronological start time
    sortOptions.scheduledStartTime = 1;
  }

  const [items, totalItems] = await Promise.all([
    Interview.find(query)
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .populate("jobId", "title company location workMode")
      .populate("candidateId", "name email")
      .populate("recruiterId", "name email")
      .lean(),
    Interview.countDocuments(query),
  ]);

  return buildPaginatedResult(items as unknown as IInterview[], totalItems, page, limit);
};

/*
|--------------------------------------------------------------------------
| 4. Get Multi-Round Interview History for Application
|--------------------------------------------------------------------------
*/
export const getInterviewsForApplication = async (
  applicationId: string,
  actorUserId: string,
  actorRole: string
): Promise<IInterview[]> => {
  const application = await Application.findOne({
    _id: applicationId,
    isDeleted: false,
  }).lean();

  if (!application) {
    throw new AppError("Application not found.", HTTP_STATUS.NOT_FOUND);
  }

  // Authorization Check
  if (actorRole === USER_ROLES.CANDIDATE) {
    if (application.applicantId.toString() !== actorUserId) {
      throw new AppError(
        "You are not authorized to view interviews for this application.",
        HTTP_STATUS.FORBIDDEN
      );
    }
  } else {
    await verifyRecruiterJobAccess(application.jobId, actorUserId, actorRole);
  }

  const interviews = await Interview.find({
    applicationId: new Types.ObjectId(applicationId),
    isDeleted: false,
  })
    .sort({ roundNumber: 1, createdAt: 1 })
    .populate("jobId", "title company")
    .populate("candidateId", "name email")
    .populate("recruiterId", "name email");

  return interviews;
};

/*
|--------------------------------------------------------------------------
| 5. Reschedule Interview
|--------------------------------------------------------------------------
*/
export const rescheduleInterview = async (
  interviewId: string,
  input: RescheduleInterviewInput,
  actorUserId: string,
  actorRole: string
): Promise<IInterview> => {
  const interview = await Interview.findOne({
    _id: interviewId,
    isDeleted: false,
  });

  if (!interview) {
    throw new AppError("Interview not found.", HTTP_STATUS.NOT_FOUND);
  }

  // Recruiter authorization
  await verifyRecruiterJobAccess(interview.jobId, actorUserId, actorRole);

  const currentStatus = interview.status;

  if (!isValidInterviewTransition(currentStatus, INTERVIEW_STATUS.RESCHEDULED)) {
    throw new AppError(
      `Cannot reschedule interview from finalized state "${currentStatus}".`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const newStartTime = new Date(input.scheduledStartTime);
  if (isNaN(newStartTime.getTime())) {
    throw new AppError(
      "Invalid scheduledStartTime format.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (newStartTime.getTime() < Date.now() - 60000) {
    throw new AppError(
      "Rescheduled time cannot be in the past.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const duration = input.durationMinutes || interview.durationMinutes || 45;
  const newEndTime = new Date(newStartTime.getTime() + duration * 60000);

  // Check overlap conflict
  await checkSchedulingConflict({
    candidateId: interview.candidateId,
    recruiterId: interview.recruiterId,
    startTime: newStartTime,
    endTime: newEndTime,
    excludeInterviewId: interview._id,
  });

  // Concurrency-protected state update
  const updatedInterview = await Interview.findOneAndUpdate(
    {
      _id: interviewId,
      status: currentStatus,
      isDeleted: false,
    },
    {
      $set: {
        scheduledStartTime: newStartTime,
        scheduledEndTime: newEndTime,
        durationMinutes: duration,
        timezone: input.timezone?.trim() || interview.timezone,
        locationOrLink:
          input.locationOrLink !== undefined
            ? input.locationOrLink.trim()
            : interview.locationOrLink,
        notes:
          input.notes !== undefined ? input.notes.trim() : interview.notes,
        status: INTERVIEW_STATUS.RESCHEDULED,
        candidateResponse: {
          status: CANDIDATE_RSVP_STATUS.PENDING,
          note: input.reason?.trim() || undefined,
        },
        reminderSent24h: false,
        reminderSent1h: false,
      },
    },
    { returnDocument: "after" }
  );

  if (!updatedInterview) {
    throw new AppError(
      "Interview state was modified concurrently by another process. Please refresh.",
      HTTP_STATUS.CONFLICT
    );
  }

  return updatedInterview;
};

/*
|--------------------------------------------------------------------------
| 6. Candidate RSVP (Accept / Decline / Request Reschedule)
|--------------------------------------------------------------------------
*/
export const candidateRsvp = async (
  interviewId: string,
  input: CandidateRsvpInput,
  actorUserId: string
): Promise<IInterview> => {
  const interview = await Interview.findOne({
    _id: interviewId,
    isDeleted: false,
  });

  if (!interview) {
    throw new AppError("Interview not found.", HTTP_STATUS.NOT_FOUND);
  }

  if (interview.candidateId.toString() !== actorUserId) {
    throw new AppError(
      "You are not authorized to respond to this interview invitation.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  const currentStatus = interview.status;

  // Idempotency: If candidate repeats identical response
  if (
    input.action === "accept" &&
    currentStatus === INTERVIEW_STATUS.ACCEPTED
  ) {
    return interview;
  }

  if (
    input.action === "decline" &&
    currentStatus === INTERVIEW_STATUS.DECLINED
  ) {
    return interview;
  }

  let targetStatus: InterviewStatus;
  let rsvpStatus: any;

  switch (input.action) {
    case "accept":
      targetStatus = INTERVIEW_STATUS.ACCEPTED;
      rsvpStatus = CANDIDATE_RSVP_STATUS.ACCEPTED;
      break;
    case "decline":
      targetStatus = INTERVIEW_STATUS.DECLINED;
      rsvpStatus = CANDIDATE_RSVP_STATUS.DECLINED;
      break;
    case "request_reschedule":
      targetStatus = INTERVIEW_STATUS.RESCHEDULE_REQUESTED;
      rsvpStatus = CANDIDATE_RSVP_STATUS.RESCHEDULE_REQUESTED;
      break;
    default:
      throw new AppError("Invalid RSVP action.", HTTP_STATUS.BAD_REQUEST);
  }

  if (!isValidInterviewTransition(currentStatus, targetStatus)) {
    throw new AppError(
      `Cannot transition interview from "${currentStatus}" to "${targetStatus}".`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const updatedInterview = await Interview.findOneAndUpdate(
    {
      _id: interviewId,
      status: currentStatus,
      isDeleted: false,
    },
    {
      $set: {
        status: targetStatus,
        candidateResponse: {
          status: rsvpStatus,
          respondedAt: new Date(),
          note: input.note?.trim() || undefined,
          suggestedTime: input.suggestedTime?.trim() || undefined,
        },
      },
    },
    { returnDocument: "after" }
  );

  if (!updatedInterview) {
    throw new AppError(
      "Interview status was modified concurrently by another action. Please refresh.",
      HTTP_STATUS.CONFLICT
    );
  }

  return updatedInterview;
};

/*
|--------------------------------------------------------------------------
| 7. Cancel Interview
|--------------------------------------------------------------------------
*/
export const cancelInterview = async (
  interviewId: string,
  reason: string | undefined,
  actorUserId: string,
  actorRole: string
): Promise<IInterview> => {
  const interview = await Interview.findOne({
    _id: interviewId,
    isDeleted: false,
  });

  if (!interview) {
    throw new AppError("Interview not found.", HTTP_STATUS.NOT_FOUND);
  }

  // Idempotency: If already cancelled
  if (interview.status === INTERVIEW_STATUS.CANCELLED) {
    return interview;
  }

  // Authorization Check
  if (actorRole === USER_ROLES.CANDIDATE) {
    if (interview.candidateId.toString() !== actorUserId) {
      throw new AppError(
        "You are not authorized to cancel this interview.",
        HTTP_STATUS.FORBIDDEN
      );
    }
  } else {
    await verifyRecruiterJobAccess(interview.jobId, actorUserId, actorRole);
  }

  if (!isValidInterviewTransition(interview.status, INTERVIEW_STATUS.CANCELLED)) {
    throw new AppError(
      `Cannot cancel an interview with status "${interview.status}".`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const updatedInterview = await Interview.findOneAndUpdate(
    {
      _id: interviewId,
      status: interview.status,
      isDeleted: false,
    },
    {
      $set: {
        status: INTERVIEW_STATUS.CANCELLED,
        notes: reason ? `${interview.notes || ""}\n[Cancellation Reason]: ${reason.trim()}`.trim() : interview.notes,
      },
    },
    { returnDocument: "after" }
  );

  if (!updatedInterview) {
    throw new AppError(
      "Interview status was modified concurrently. Please refresh.",
      HTTP_STATUS.CONFLICT
    );
  }

  return updatedInterview;
};

/*
|--------------------------------------------------------------------------
| 8. Complete Interview & Submit Feedback
|--------------------------------------------------------------------------
*/
export const completeInterview = async (
  interviewId: string,
  feedback: SubmitFeedbackInput | undefined,
  actorUserId: string,
  actorRole: string
): Promise<IInterview> => {
  const interview = await Interview.findOne({
    _id: interviewId,
    isDeleted: false,
  });

  if (!interview) {
    throw new AppError("Interview not found.", HTTP_STATUS.NOT_FOUND);
  }

  if (actorRole === USER_ROLES.CANDIDATE) {
    throw new AppError(
      "Candidates cannot mark interviews as completed.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  await verifyRecruiterJobAccess(interview.jobId, actorUserId, actorRole);

  if (!isValidInterviewTransition(interview.status, INTERVIEW_STATUS.COMPLETED)) {
    throw new AppError(
      `Cannot complete an interview with status "${interview.status}".`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const updateSet: Record<string, any> = {
    status: INTERVIEW_STATUS.COMPLETED,
  };

  if (feedback && typeof feedback.rating === "number") {
    updateSet.feedback = {
      rating: feedback.rating,
      notes: feedback.notes?.trim() || "",
      submittedAt: new Date(),
    };
  }

  const updatedInterview = await Interview.findOneAndUpdate(
    {
      _id: interviewId,
      status: interview.status,
      isDeleted: false,
    },
    {
      $set: updateSet,
    },
    { returnDocument: "after" }
  );

  if (!updatedInterview) {
    throw new AppError(
      "Interview status was modified concurrently. Please refresh.",
      HTTP_STATUS.CONFLICT
    );
  }

  return updatedInterview;
};
