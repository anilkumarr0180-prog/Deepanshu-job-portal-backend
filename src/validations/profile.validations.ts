import { z } from "zod";
import { Types } from "mongoose";

const urlSchema = z
  .string()
  .trim()
  .url("Please provide a valid URL.")
  .optional()
  .or(z.literal(""));

const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: "Invalid ObjectId format.",
});

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
      .optional()
      .or(z.literal("")),

    profilePicture: urlSchema,
    profilePicturePublicId: z.string().trim().optional(),

    resumeUrl: urlSchema,
    resumePublicId: z.string().trim().optional(),
    resumeFileName: z.string().trim().optional(),
    resumeUploadedAt: z.coerce.date().optional(),

    headline: z.string().trim().max(200, "Headline cannot exceed 200 characters.").optional(),

    bio: z.string().trim().max(2000, "Bio cannot exceed 2000 characters.").optional(),

    skills: z.array(z.string().trim().min(1, "Skill cannot be empty.")).optional(),

    experience: z
      .array(
        z.object({
          title: z.string().trim().min(1, "Job title is required."),
          company: z.string().trim().min(1, "Company name is required."),
          location: z.string().trim().optional(),
          startDate: z.coerce.date().optional(),
          endDate: z.coerce.date().optional(),
          current: z.boolean().optional(),
          description: z.string().trim().optional(),
        })
      )
      .optional(),

    education: z
      .array(
        z.object({
          institution: z.string().trim().min(1, "Institution name is required."),
          degree: z.string().trim().min(1, "Degree is required."),
          fieldOfStudy: z.string().trim().optional(),
          startDate: z.coerce.date().optional(),
          endDate: z.coerce.date().optional(),
          current: z.boolean().optional(),
        })
      )
      .optional(),

    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    country: z.string().trim().optional(),

    designation: z.string().trim().optional(),
    department: z.string().trim().optional(),

    companyId: objectIdSchema.optional(),

    socialLinks: z
      .object({
        linkedin: urlSchema,
        github: urlSchema,
        portfolio: urlSchema,
        twitter: urlSchema,
        website: urlSchema,
      })
      .optional(),
  }),
});