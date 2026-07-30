export const JOB_STATUS = {
  DRAFT: "DRAFT",
  ACTIVE: "ACTIVE",
  CLOSED: "CLOSED",
} as const;

export type JobStatus =
  (typeof JOB_STATUS)[keyof typeof JOB_STATUS];