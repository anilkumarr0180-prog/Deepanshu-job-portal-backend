import { z } from "zod";
import { Types } from "mongoose";
import { USER_ROLES } from "../constants/roles";
import { JOB_STATUS } from "../constants/job-status";

const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: "Invalid ID format.",
});

/*
|--------------------------------------------------------------------------
| Get Users Query Validation Schema
|--------------------------------------------------------------------------
*/
export const getUsersQuerySchema = z.object({
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
      role: z
        .enum([
          USER_ROLES.CANDIDATE,
          USER_ROLES.RECRUITER,
          USER_ROLES.ADMIN,
        ])
        .optional(),
      isBlocked: z.enum(["true", "false"]).optional(),
      sort: z
        .enum(["newest", "oldest", "name-asc", "name-desc"])
        .optional(),
    })
    .optional(),
});

/*
|--------------------------------------------------------------------------
| User ID Param Validation Schema
|--------------------------------------------------------------------------
*/
export const userIdParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

/*
|--------------------------------------------------------------------------
| Get Admin Jobs Query Validation Schema
|--------------------------------------------------------------------------
*/
export const getAdminJobsQuerySchema = z.object({
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
      recruiterId: objectIdSchema.optional(),
      status: z
        .enum([
          JOB_STATUS.DRAFT,
          JOB_STATUS.ACTIVE,
          JOB_STATUS.CLOSED,
        ])
        .optional(),
      sort: z
        .enum(["newest", "oldest", "salary-high", "salary-low"])
        .optional(),
    })
    .optional(),
});

/*
|--------------------------------------------------------------------------
| Job ID Param Validation Schema
|--------------------------------------------------------------------------
*/
export const jobIdParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

/*
|--------------------------------------------------------------------------
| Verify Company Validation Schema
|--------------------------------------------------------------------------
*/
export const verifyCompanySchema = z.object({
  params: z.object({
    companyId: objectIdSchema.optional(),
    id: objectIdSchema.optional(),
  }),
  body: z.object({
    isVerified: z.boolean({
      message: "isVerified field is required.",
    }),
  }),
});
