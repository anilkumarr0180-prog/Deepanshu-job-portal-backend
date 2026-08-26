import { z } from "zod";
import { APPLICATION_STATUS } from "../constants/application-status";

export const applyJobSchema = z.object({
  params: z.object({
    id: z.string().regex(
      /^[0-9a-fA-F]{24}$/,
      "Invalid job id."
    ),
  }),

  body: z.object({
    coverLetter: z
      .string()
      .trim()
      .max(5000, "Cover letter cannot exceed 5000 characters.")
      .optional(),
    applicantName: z
      .string()
      .trim()
      .max(100, "Applicant name cannot exceed 100 characters.")
      .optional(),
    applicantPhone: z
      .string()
      .trim()
      .max(25, "Applicant phone cannot exceed 25 characters.")
      .optional(),
    applicantDesignation: z
      .string()
      .trim()
      .max(100, "Applicant designation cannot exceed 100 characters.")
      .optional(),
    experienceYears: z
      .number()
      .min(0, "Experience years cannot be negative.")
      .max(70, "Invalid experience years.")
      .optional(),
    relevantSkills: z
      .array(z.string().trim().max(50, "Skill name cannot exceed 50 characters."))
      .max(50, "Cannot specify more than 50 skills.")
      .optional(),
    noticePeriod: z
      .string()
      .trim()
      .max(50, "Notice period cannot exceed 50 characters.")
      .optional(),
    resumeUrl: z.string().trim().optional(),
    resumePublicId: z.string().trim().optional(),
    resumeFileName: z
      .string()
      .trim()
      .max(255, "Resume file name cannot exceed 255 characters.")
      .optional(),
  }),
});

export const getJobApplicationsSchema = z.object({
  params: z.object({
    id: z.string().regex(
      /^[0-9a-fA-F]{24}$/,
      "Invalid job id."
    ),
  }),
});

/*
|--------------------------------------------------------------------------
| Update Application Status
|--------------------------------------------------------------------------
*/

export const updateApplicationStatusSchema = z.object({
  params: z.object({
    id: z.string().regex(
      /^[0-9a-fA-F]{24}$/,
      "Invalid application id."
    ),
  }),
  body: z.object({
    status: z.string().trim().min(1, "Status cannot be empty."),
    reason: z
      .string()
      .trim()
      .max(1000, "Reason cannot exceed 1000 characters.")
      .optional(),
    interviewDetails: z
      .object({
        mode: z.enum(["video", "in-person", "phone"]).optional(),
        date: z.string().optional(),
        time: z.string().optional(),
        type: z.string().optional(),
        locationOrLink: z.string().optional(),
        notes: z.string().optional(),
        timezone: z.string().optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  }),
});

/*
|--------------------------------------------------------------------------
| Get Application History
|--------------------------------------------------------------------------
*/
export const getApplicationHistorySchema = z.object({
  params: z.object({
    id: z.string().regex(
      /^[0-9a-fA-F]{24}$/,
      "Invalid application id."
    ),
  }),
});

/*
|--------------------------------------------------------------------------
| Withdraw Application
|--------------------------------------------------------------------------
*/

export const withdrawApplicationSchema = z.object({
  params: z.object({
    id: z.string().regex(
      /^[0-9a-fA-F]{24}$/,
      "Invalid application id."
    ),
  }),
});

/*
|--------------------------------------------------------------------------
| Get Applications Query Schema (Pagination, Sorting, Filtering)
|--------------------------------------------------------------------------
*/

export const getApplicationsQuerySchema = z.object({
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
      sort: z.enum(["newest", "oldest"]).optional(),
      status: z
        .enum([
          APPLICATION_STATUS.APPLIED,
          APPLICATION_STATUS.UNDER_REVIEW,
          APPLICATION_STATUS.SHORTLISTED,
          APPLICATION_STATUS.INTERVIEW,
          APPLICATION_STATUS.REJECTED,
          APPLICATION_STATUS.HIRED,
        ])
        .optional(),
    })
    .optional(),
});
