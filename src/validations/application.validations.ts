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
      .optional(),
  }),
});


/*
|--------------------------------------------------------------------------
| Update Application Status
|--------------------------------------------------------------------------
*/

export const updateApplicationStatusSchema = z.object({
  body: z.object({
    status: z.enum([
      APPLICATION_STATUS.SHORTLISTED,
      APPLICATION_STATUS.INTERVIEW,
      APPLICATION_STATUS.REJECTED,
      APPLICATION_STATUS.HIRED,
    ]),
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