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
        .min(5, "Description must be at least 5 characters.")
        .default("No detailed description provided for this position."),

      company: z
        .string()
        .trim()
        .min(2, "Company name must be at least 2 characters.")
        .max(100, "Company name cannot exceed 100 characters.")
        .default("My Company"),

      location: z
        .string()
        .trim()
        .min(2, "Location must be at least 2 characters.")
        .max(100, "Location cannot exceed 100 characters.")
        .default("Remote"),

      salaryMin: z.coerce
        .number()
        .min(0, "Minimum salary cannot be negative.")
        .default(0),

      salaryMax: z.coerce
        .number()
        .min(0, "Maximum salary cannot be negative.")
        .default(0),

      employmentType: z
        .string()
        .optional()
        .default("Full Time"),

      experienceLevel: z
        .string()
        .optional()
        .default("3-5 Years"),

      status: z
        .string()
        .transform((val) => val.toUpperCase())
        .optional()
        .default("ACTIVE"),

      skills: z
        .array(z.string().trim().min(1, "Skill cannot be empty."))
        .optional()
        .default([]),
    })
    .transform((data) => {
      if (data.salaryMin > data.salaryMax && data.salaryMax > 0) {
        const temp = data.salaryMin;
        data.salaryMin = data.salaryMax;
        data.salaryMax = temp;
      } else if (data.salaryMax === 0 && data.salaryMin > 0) {
        data.salaryMax = data.salaryMin;
      }
      return data;
    }),
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