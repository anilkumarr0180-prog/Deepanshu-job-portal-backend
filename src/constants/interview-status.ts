export const INTERVIEW_STATUS = {
  SCHEDULED: "scheduled",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  RESCHEDULE_REQUESTED: "reschedule_requested",
  RESCHEDULED: "rescheduled",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type InterviewStatus =
  (typeof INTERVIEW_STATUS)[keyof typeof INTERVIEW_STATUS];

export const INTERVIEW_MODE = {
  VIDEO: "video",
  IN_PERSON: "in-person",
  PHONE: "phone",
} as const;

export type InterviewMode =
  (typeof INTERVIEW_MODE)[keyof typeof INTERVIEW_MODE];

export const INTERVIEW_TYPE = {
  HR_SCREENING: "HR Screening",
  TECHNICAL_INTERVIEW: "Technical Interview",
  SYSTEM_DESIGN: "System Design Round",
  ON_SITE_CODING: "On-Site Coding Pair",
  EXECUTIVE_ROUND: "Executive Final Round",
  CULTURE_FIT: "Culture & Fit Round",
  OTHER: "Other",
} as const;

export type InterviewType =
  (typeof INTERVIEW_TYPE)[keyof typeof INTERVIEW_TYPE] | string;

export const CANDIDATE_RSVP_STATUS = {
  PENDING: "pending",
  ACCEPTED: "accepted",
  DECLINED: "declined",
  RESCHEDULE_REQUESTED: "reschedule_requested",
} as const;

export type CandidateRsvpStatus =
  (typeof CANDIDATE_RSVP_STATUS)[keyof typeof CANDIDATE_RSVP_STATUS];

/*
|--------------------------------------------------------------------------
| Valid Interview Status Transitions
|--------------------------------------------------------------------------
|
| SCHEDULED            -> ACCEPTED, DECLINED, RESCHEDULE_REQUESTED, RESCHEDULED, CANCELLED
| ACCEPTED             -> RESCHEDULE_REQUESTED, RESCHEDULED, COMPLETED, CANCELLED
| DECLINED             -> RESCHEDULED, CANCELLED
| RESCHEDULE_REQUESTED -> RESCHEDULED, CANCELLED
| RESCHEDULED          -> ACCEPTED, DECLINED, RESCHEDULE_REQUESTED, CANCELLED
| COMPLETED            -> Terminal
| CANCELLED            -> Terminal
|
*/
export const VALID_INTERVIEW_TRANSITIONS: Record<
  InterviewStatus,
  readonly InterviewStatus[]
> = {
  [INTERVIEW_STATUS.SCHEDULED]: [
    INTERVIEW_STATUS.ACCEPTED,
    INTERVIEW_STATUS.DECLINED,
    INTERVIEW_STATUS.RESCHEDULE_REQUESTED,
    INTERVIEW_STATUS.RESCHEDULED,
    INTERVIEW_STATUS.CANCELLED,
  ],
  [INTERVIEW_STATUS.ACCEPTED]: [
    INTERVIEW_STATUS.RESCHEDULE_REQUESTED,
    INTERVIEW_STATUS.RESCHEDULED,
    INTERVIEW_STATUS.COMPLETED,
    INTERVIEW_STATUS.CANCELLED,
  ],
  [INTERVIEW_STATUS.DECLINED]: [
    INTERVIEW_STATUS.RESCHEDULED,
    INTERVIEW_STATUS.CANCELLED,
  ],
  [INTERVIEW_STATUS.RESCHEDULE_REQUESTED]: [
    INTERVIEW_STATUS.RESCHEDULED,
    INTERVIEW_STATUS.CANCELLED,
  ],
  [INTERVIEW_STATUS.RESCHEDULED]: [
    INTERVIEW_STATUS.ACCEPTED,
    INTERVIEW_STATUS.DECLINED,
    INTERVIEW_STATUS.RESCHEDULE_REQUESTED,
    INTERVIEW_STATUS.CANCELLED,
  ],
  [INTERVIEW_STATUS.COMPLETED]: [],
  [INTERVIEW_STATUS.CANCELLED]: [],
} as const;

export const isValidInterviewTransition = (
  fromStatus: InterviewStatus,
  toStatus: InterviewStatus
): boolean => {
  if (fromStatus === toStatus) return true;
  const allowed = VALID_INTERVIEW_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
};
