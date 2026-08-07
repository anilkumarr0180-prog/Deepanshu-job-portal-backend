import { z } from "zod";
import { Types } from "mongoose";

const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: "Invalid job ID format.",
});

/*
|--------------------------------------------------------------------------
| Job ID Param Validation Schema
|--------------------------------------------------------------------------
*/
export const jobIdParamSchema = z.object({
  params: z.object({
    jobId: objectIdSchema,
  }),
});

/*
|--------------------------------------------------------------------------
| Get Saved Jobs Query Validation Schema
|--------------------------------------------------------------------------
*/
export const getSavedJobsQuerySchema = z.object({
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
    })
    .optional(),
});
