export const USER_ROLES = {
  ADMIN: "admin",
  RECRUITER: "recruiter",
  CANDIDATE: "candidate",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];