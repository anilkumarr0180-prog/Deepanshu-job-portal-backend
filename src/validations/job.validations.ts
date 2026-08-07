import { z } from "zod";
import { Types } from "mongoose";
import { EMPLOYMENT_TYPE } from "../constants/employment-type";
import { EXPERIENCE_LEVEL } from "../constants/experience-level";
import { JOB_STATUS } from "../constants/job-status";

/*
|--------------------------------------------------------------------------
| Create Job Validation Schema
|--------------------------------------------------------------------------
*/
export const createJobSchema = z.object({
  body: z
    .object({
      title: z
        .string()
        .trim()
        .min(2, "Job title must be at least 2 characters.")
        .max(100, "Job title cannot exceed 100 characters."),

      description: z
        .string()
        .trim()
        .min(10, "Description must be at least 10 characters."),

      company: z
        .string()
        .trim()
        .min(2, "Company name must be at least 2 characters.")
        .max(100, "Company name cannot exceed 100 characters."),

      location: z
        .string()
        .trim()
        .min(2, "Location must be at least 2 characters.")
        .max(100, "Location cannot exceed 100 characters."),

      salaryMin: z
        .number()
        .min(0, "Minimum salary cannot be negative."),

      salaryMax: z
        .number()
        .min(0, "Maximum salary cannot be negative."),

      employmentType: z.enum([
        EMPLOYMENT_TYPE.FULL_TIME,
        EMPLOYMENT_TYPE.PART_TIME,
        EMPLOYMENT_TYPE.CONTRACT,
        EMPLOYMENT_TYPE.INTERNSHIP,
        EMPLOYMENT_TYPE.REMOTE,
      ]),

      experienceLevel: z.enum([
        EXPERIENCE_LEVEL.FRESHER,
        EXPERIENCE_LEVEL.ONE_TO_TWO_YEARS,
        EXPERIENCE_LEVEL.THREE_TO_FIVE_YEARS,
        EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
      ]),

      status: z
        .enum([
          JOB_STATUS.DRAFT,
          JOB_STATUS.ACTIVE,
          JOB_STATUS.CLOSED,
        ])
        .optional(),

      skills: z
        .array(
          z.string().trim().min(1, "Skill cannot be empty.")
        )
        .min(1, "At least one skill is required."),
    })
    .refine(
      (data) => data.salaryMax >= data.salaryMin,
      {
        message:
          "Maximum salary must be greater than or equal to minimum salary.",
        path: ["salaryMax"],
      }
    ),
});

/*
|--------------------------------------------------------------------------
| Update Job Validation Schema
|--------------------------------------------------------------------------
*/
export const updateJobSchema = z.object({
  body: z
    .object({
      title: z
        .string()
        .trim()
        .min(2, "Job title must be at least 2 characters.")
        .max(100, "Job title cannot exceed 100 characters.")
        .optional(),

      description: z
        .string()
        .trim()
        .min(10, "Description must be at least 10 characters.")
        .optional(),

      company: z
        .string()
        .trim()
        .min(2, "Company name must be at least 2 characters.")
        .max(100, "Company name cannot exceed 100 characters.")
        .optional(),

      location: z
        .string()
        .trim()
        .min(2, "Location must be at least 2 characters.")
        .max(100, "Location cannot exceed 100 characters.")
        .optional(),

      salaryMin: z
        .number()
        .min(0, "Minimum salary cannot be negative.")
        .optional(),

      salaryMax: z
        .number()
        .min(0, "Maximum salary cannot be negative.")
        .optional(),

      employmentType: z
        .enum([
          EMPLOYMENT_TYPE.FULL_TIME,
          EMPLOYMENT_TYPE.PART_TIME,
          EMPLOYMENT_TYPE.CONTRACT,
          EMPLOYMENT_TYPE.INTERNSHIP,
          EMPLOYMENT_TYPE.REMOTE,
        ])
        .optional(),

      experienceLevel: z
        .enum([
          EXPERIENCE_LEVEL.FRESHER,
          EXPERIENCE_LEVEL.ONE_TO_TWO_YEARS,
          EXPERIENCE_LEVEL.THREE_TO_FIVE_YEARS,
          EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
        ])
        .optional(),

      status: z
        .enum([
          JOB_STATUS.DRAFT,
          JOB_STATUS.ACTIVE,
          JOB_STATUS.CLOSED,
        ])
        .optional(),

      skills: z
        .array(
          z.string().trim().min(1, "Skill cannot be empty.")
        )
        .min(1, "At least one skill is required.")
        .optional(),
    })
    .refine(
      (data) =>
        data.salaryMin === undefined ||
        data.salaryMax === undefined ||
        data.salaryMax >= data.salaryMin,
      {
        message:
          "Maximum salary must be greater than or equal to minimum salary.",
        path: ["salaryMax"],
      }
    ),
});

/*
|--------------------------------------------------------------------------
| Job ID Param Validation Schema
|--------------------------------------------------------------------------
*/
const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: "Invalid job ID format.",
});

export const jobIdParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

/*
|--------------------------------------------------------------------------
| Get Jobs Query Validation Schema
|--------------------------------------------------------------------------
*/
export const getJobsQuerySchema = z.object({
  query: z
    .object({
      page: z.coerce
        .number()
        .int("Page must be an integer.")
        .min(1, "Page must be at least 1.")
        .optional(),
      limit: z.coerce
        .number()
        .int("Limit must be an integer.")
        .min(1, "Limit must be at least 1.")
        .max(100, "Limit cannot exceed 100.")
        .optional(),
      search: z.string().trim().optional(),
      location: z.string().trim().optional(),
      employmentType: z
        .enum([
          EMPLOYMENT_TYPE.FULL_TIME,
          EMPLOYMENT_TYPE.PART_TIME,
          EMPLOYMENT_TYPE.CONTRACT,
          EMPLOYMENT_TYPE.INTERNSHIP,
          EMPLOYMENT_TYPE.REMOTE,
        ])
        .optional(),
      experienceLevel: z
        .enum([
          EXPERIENCE_LEVEL.FRESHER,
          EXPERIENCE_LEVEL.ONE_TO_TWO_YEARS,
          EXPERIENCE_LEVEL.THREE_TO_FIVE_YEARS,
          EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
        ])
        .optional(),
      status: z
        .enum([
          JOB_STATUS.DRAFT,
          JOB_STATUS.ACTIVE,
          JOB_STATUS.CLOSED,
        ])
        .optional(),
      minSalary: z.coerce.number().min(0, "Minimum salary cannot be negative.").optional(),
      maxSalary: z.coerce.number().min(0, "Maximum salary cannot be negative.").optional(),
      skills: z.string().trim().optional(),
      sort: z.enum(["newest", "oldest", "salary-high", "salary-low"]).optional(),
    })
    .optional(),
});