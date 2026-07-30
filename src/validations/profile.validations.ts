import { z } from "zod";

export const updateProfileSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).optional(),

    phone: z.string().trim().optional(),

    profilePicture: z.string().trim().optional(),

    resumeUrl: z.string().trim().optional(),
  }),
});