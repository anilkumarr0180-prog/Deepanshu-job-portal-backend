export const EXPERIENCE_LEVEL = {
  FRESHER: "Fresher",
  ONE_TO_TWO_YEARS: "1-2 Years",
  THREE_TO_FIVE_YEARS: "3-5 Years",
  FIVE_PLUS_YEARS: "5+ Years",
} as const;

export type ExperienceLevel =
  (typeof EXPERIENCE_LEVEL)[keyof typeof EXPERIENCE_LEVEL];