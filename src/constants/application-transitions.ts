import {
  APPLICATION_STATUS,
  ApplicationStatus,
} from "./application-status";

/*
|--------------------------------------------------------------------------
| ATS Application Status Transition Matrix (Single Source of Truth)
|--------------------------------------------------------------------------
|
| Default Logical Workflow:
| Applied -> Under Review -> Shortlisted -> Interview -> Hired
|
| Allowed Transitions:
| APPLIED      -> UNDER_REVIEW, REJECTED
| UNDER_REVIEW -> SHORTLISTED, INTERVIEW, REJECTED
| SHORTLISTED  -> INTERVIEW, REJECTED
| INTERVIEW    -> HIRED, REJECTED
| HIRED        -> Terminal (no transitions)
| REJECTED     -> Terminal (no transitions)
|
*/

export const VALID_APPLICATION_TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  [APPLICATION_STATUS.APPLIED]: [
    APPLICATION_STATUS.UNDER_REVIEW,
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
  [APPLICATION_STATUS.HIRED]: [],
  [APPLICATION_STATUS.REJECTED]: [],
} as const;

export const TERMINAL_APPLICATION_STATUSES: readonly ApplicationStatus[] = [
  APPLICATION_STATUS.HIRED,
  APPLICATION_STATUS.REJECTED,
] as const;

/**
 * Normalizes loose status strings (e.g., 'shortlisted', 'UNDER_REVIEW', 'under review', 'Applied')
 * into canonical ApplicationStatus enum values.
 */
export const normalizeApplicationStatus = (input: unknown): ApplicationStatus | null => {
  if (typeof input !== "string" || !input.trim()) {
    return null;
  }

  const raw = input.trim().toLowerCase().replace(/[\s-]+/g, "_");

  switch (raw) {
    case "applied":
      return APPLICATION_STATUS.APPLIED;
    case "under_review":
    case "reviewing":
    case "underreview":
      return APPLICATION_STATUS.UNDER_REVIEW;
    case "shortlisted":
    case "shortlist":
      return APPLICATION_STATUS.SHORTLISTED;
    case "interview":
    case "interviewing":
    case "interview_scheduled":
      return APPLICATION_STATUS.INTERVIEW;
    case "rejected":
    case "reject":
      return APPLICATION_STATUS.REJECTED;
    case "hired":
    case "hire":
    case "offer_accepted":
      return APPLICATION_STATUS.HIRED;
    default: {
      const match = (Object.values(APPLICATION_STATUS) as ApplicationStatus[]).find(
        (val) => val.toLowerCase() === input.trim().toLowerCase()
      );
      return match || null;
    }
  }
};

/**
 * Checks if a status is terminal (no outgoing transitions allowed).
 */
export const isTerminalApplicationStatus = (status: ApplicationStatus): boolean => {
  return TERMINAL_APPLICATION_STATUSES.includes(status);
};

/**
 * Returns allowed next statuses from current status.
 */
export const getAllowedNextStatuses = (currentStatus: ApplicationStatus): readonly ApplicationStatus[] => {
  return VALID_APPLICATION_TRANSITIONS[currentStatus] || [];
};

/**
 * Validates whether transition from `fromStatus` to `toStatus` is permitted.
 */
export const isValidStatusTransition = (
  fromStatus: ApplicationStatus,
  toStatus: ApplicationStatus
): boolean => {
  if (fromStatus === toStatus) {
    return true;
  }

  const allowedNext = getAllowedNextStatuses(fromStatus);
  return allowedNext.includes(toStatus);
};
