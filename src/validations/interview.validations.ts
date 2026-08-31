import { z } from "zod";
import {
  INTERVIEW_STATUS,
  INTERVIEW_MODE,
} from "../constants/interview-status";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const interviewIdParamSchema = z.object({
  params: z.object({
    interviewId: z.string().regex(objectIdRegex, "Invalid interview id."),
  }),
});

export const applicationIdParamSchema = z.object({
  params: z.object({
    applicationId: z.string().regex(objectIdRegex, "Invalid application id."),
  }),
});

/*
|--------------------------------------------------------------------------
| Create / Schedule Interview Validation Schema
|--------------------------------------------------------------------------
*/
export const createInterviewSchema = z.object({
  params: z
    .object({
      applicationId: z.string().regex(objectIdRegex, "Invalid application id.").optional(),
    })
    .optional(),

  body: z.object({
    applicationId: z
      .string()
      .regex(objectIdRegex, "Invalid application id.")
      .optional(),

    roundNumber: z
      .number()
      .int("Round number must be an integer.")
      .min(1, "Round number must be at least 1.")
      .optional(),

    title: z
      .string()
      .trim()
      .min(1, "Title cannot be empty.")
      .max(150, "Title cannot exceed 150 characters.")
      .optional(),

    type: z
      .string()
      .trim()
      .min(1, "Interview type cannot be empty.")
      .max(100, "Interview type cannot exceed 100 characters.")
      .optional(),

    mode: z
      .enum([
        INTERVIEW_MODE.VIDEO,
        INTERVIEW_MODE.IN_PERSON,
        INTERVIEW_MODE.PHONE,
      ])
      .default(INTERVIEW_MODE.VIDEO),

    scheduledStartTime: z
      .string()
      .trim()
      .refine(
        (val) => {
          const date = new Date(val);
          return !isNaN(date.getTime()) && date.getTime() > Date.now() - 60000;
        },
        {
          message: "scheduledStartTime must be a valid ISO date in the future.",
        }
      ),

    durationMinutes: z
      .number()
      .int("Duration must be an integer in minutes.")
      .min(5, "Duration must be at least 5 minutes.")
      .max(480, "Duration cannot exceed 480 minutes (8 hours).")
      .default(45),

    timezone: z
      .string()
      .trim()
      .max(100, "Timezone identifier cannot exceed 100 characters.")
      .optional()
      .default("UTC"),

    locationOrLink: z
      .string()
      .trim()
      .max(1000, "Location or meeting link cannot exceed 1000 characters.")
      .optional(),

    notes: z
      .string()
      .trim()
      .max(2000, "Instructions/notes cannot exceed 2000 characters.")
      .optional(),
  }),
}).refine(
  (data) => Boolean(data.body?.applicationId || data.params?.applicationId),
  {
    message: "applicationId is required in body or route params.",
    path: ["body", "applicationId"],
  }
);

/*
|--------------------------------------------------------------------------
| Reschedule Interview Validation Schema
|--------------------------------------------------------------------------
*/
export const rescheduleInterviewSchema = z.object({
  params: z.object({
    interviewId: z.string().regex(objectIdRegex, "Invalid interview id.").optional(),
    id: z.string().regex(objectIdRegex, "Invalid interview id.").optional(),
  }).refine((p) => Boolean(p.interviewId || p.id), {
    message: "Invalid interview id.",
  }),

  body: z.object({
    scheduledStartTime: z
      .string()
      .trim()
      .refine(
        (val) => {
          const date = new Date(val);
          return !isNaN(date.getTime()) && date.getTime() > Date.now() - 60000;
        },
        {
          message: "scheduledStartTime must be a valid ISO date in the future.",
        }
      ),

    durationMinutes: z
      .number()
      .int("Duration must be an integer in minutes.")
      .min(5, "Duration must be at least 5 minutes.")
      .max(480, "Duration cannot exceed 480 minutes.")
      .optional(),

    timezone: z
      .string()
      .trim()
      .max(100, "Timezone identifier cannot exceed 100 characters.")
      .optional(),

    locationOrLink: z
      .string()
      .trim()
      .max(1000, "Location or link cannot exceed 1000 characters.")
      .optional(),

    notes: z
      .string()
      .trim()
      .max(2000, "Notes cannot exceed 2000 characters.")
      .optional(),

    reason: z
      .string()
      .trim()
      .max(1000, "Reschedule reason cannot exceed 1000 characters.")
      .optional(),
  }),
});

/*
|--------------------------------------------------------------------------
| Candidate RSVP Validation Schema (Accept / Decline / Request Reschedule)
|--------------------------------------------------------------------------
*/
export const candidateRsvpSchema = z
  .object({
    params: z.object({
      interviewId: z.string().regex(objectIdRegex, "Invalid interview id.").optional(),
      id: z.string().regex(objectIdRegex, "Invalid interview id.").optional(),
    }).refine((p) => Boolean(p.interviewId || p.id), {
      message: "Invalid interview id.",
    }),

    body: z.object({
      action: z.enum(["accept", "decline", "request_reschedule"], {
        error: "Action must be accept, decline, or request_reschedule.",
      }).optional(),

      note: z
        .string()
        .trim()
        .max(1000, "Note cannot exceed 1000 characters.")
        .optional(),

      suggestedTime: z
        .string()
        .trim()
        .max(200, "Suggested time cannot exceed 200 characters.")
        .optional(),
    }),
  })
  .refine(
    (data) => {
      if (data.body.action === "request_reschedule" && !data.body.suggestedTime?.trim()) {
        return false;
      }
      return true;
    },
    {
      message: "suggestedTime is required when requesting a reschedule.",
      path: ["body", "suggestedTime"],
    }
  );

/*
|--------------------------------------------------------------------------
| Submit Interview Feedback Validation Schema
|--------------------------------------------------------------------------
*/
export const submitFeedbackSchema = z.object({
  params: z.object({
    interviewId: z.string().regex(objectIdRegex, "Invalid interview id.").optional(),
    id: z.string().regex(objectIdRegex, "Invalid interview id.").optional(),
  }).refine((p) => Boolean(p.interviewId || p.id), {
    message: "Invalid interview id.",
  }),

  body: z.object({
    rating: z
      .number()
      .int("Rating must be an integer.")
      .min(1, "Rating must be between 1 and 5.")
      .max(5, "Rating must be between 1 and 5."),

    notes: z
      .string()
      .trim()
      .min(1, "Feedback notes cannot be empty.")
      .max(5000, "Feedback notes cannot exceed 5000 characters."),
  }),
});

/*
|--------------------------------------------------------------------------
| Cancel Interview Validation Schema
|--------------------------------------------------------------------------
*/
export const cancelInterviewSchema = z.object({
  params: z.object({
    interviewId: z.string().regex(objectIdRegex, "Invalid interview id.").optional(),
    id: z.string().regex(objectIdRegex, "Invalid interview id.").optional(),
  }).refine((p) => Boolean(p.interviewId || p.id), {
    message: "Invalid interview id.",
  }),

  body: z.object({
    reason: z
      .string()
      .trim()
      .max(1000, "Cancellation reason cannot exceed 1000 characters.")
      .optional(),
  }).optional(),
});

/*
|--------------------------------------------------------------------------
| Query Interviews Schema (Pagination, Filtering, Range)
|--------------------------------------------------------------------------
*/
export const getInterviewsQuerySchema = z.object({
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

      status: z
        .enum([
          INTERVIEW_STATUS.SCHEDULED,
          INTERVIEW_STATUS.ACCEPTED,
          INTERVIEW_STATUS.DECLINED,
          INTERVIEW_STATUS.RESCHEDULE_REQUESTED,
          INTERVIEW_STATUS.RESCHEDULED,
          INTERVIEW_STATUS.COMPLETED,
          INTERVIEW_STATUS.CANCELLED,
        ])
        .optional(),

      from: z.string().optional(),
      to: z.string().optional(),
      jobId: z.string().regex(objectIdRegex, "Invalid job id.").optional(),
      candidateId: z.string().regex(objectIdRegex, "Invalid candidate id.").optional(),
      applicationId: z.string().regex(objectIdRegex, "Invalid application id.").optional(),
    })
    .optional(),
});
