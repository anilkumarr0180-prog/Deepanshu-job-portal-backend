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
    coverLetter: z.string().trim().optional(),
    applicantName: z.string().trim().optional(),
    applicantPhone: z.string().trim().optional(),
    applicantDesignation: z.string().trim().optional(),
    experienceYears: z.number().optional(),
    relevantSkills: z.array(z.string().trim()).optional(),
    noticePeriod: z.string().trim().optional(),
    resumeUrl: z.string().trim().optional(),
    resumePublicId: z.string().trim().optional(),
    resumeFileName: z.string().trim().optional(),
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
    status: z.enum([
      APPLICATION_STATUS.APPLIED,
      APPLICATION_STATUS.UNDER_REVIEW,
      APPLICATION_STATUS.SHORTLISTED,
      APPLICATION_STATUS.INTERVIEW,
      APPLICATION_STATUS.REJECTED,
      APPLICATION_STATUS.HIRED,
      "applied",
      "under review",
      "under_review",
      "shortlisted",
      "interview",
      "rejected",
      "hired",
    ]),
    interviewDetails: z
      .object({
        mode: z.enum(["video", "in-person", "phone"]).optional(),
        date: z.string().optional(),
        time: z.string().optional(),
        type: z.string().optional(),
        locationOrLink: z.string().optional(),
        notes: z.string().optional(),
      })
      .optional(),
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
          APPLICATION_STATUS.SHORTLISTED,
          APPLICATION_STATUS.INTERVIEW,
          APPLICATION_STATUS.REJECTED,
          APPLICATION_STATUS.HIRED,
        ])
        .optional(),
    })
    .optional(),
});