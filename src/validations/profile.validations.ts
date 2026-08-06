import { z } from "zod";

export const updateProfileSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(100, "Name cannot exceed 100 characters.")
      .optional(),

    phone: z
      .string()
      .trim()
      .min(10, "Phone number must be at least 10 digits.")
      .max(15, "Phone number cannot exceed 15 digits.")
      .regex(/^[+]*[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/, "Please provide a valid phone number.")
      .optional(),

    profilePicture: z
      .string()
      .trim()
      .url("Please provide a valid URL for profile picture.")
      .optional(),

    resumeUrl: z
      .string()
      .trim()
      .url("Please provide a valid URL for resume.")
      .optional(),
  }),
});