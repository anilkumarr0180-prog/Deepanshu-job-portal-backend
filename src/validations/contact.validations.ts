import { z } from "zod";

export const contactMessageSchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Name must be at least 2 characters.")
      .max(100, "Name cannot exceed 100 characters."),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Please provide a valid email address.")
      .max(255, "Email cannot exceed 255 characters."),
    company: z
      .string()
      .trim()
      .max(150, "Company name cannot exceed 150 characters.")
      .optional()
      .or(z.literal("")),
    phone: z
      .string()
      .trim()
      .max(30, "Phone number cannot exceed 30 characters.")
      .optional()
      .or(z.literal("")),
    message: z
      .string()
      .trim()
      .min(5, "Message must be at least 5 characters.")
      .max(5000, "Message cannot exceed 5000 characters."),
    agreeTerms: z
      .boolean()
      .refine((val) => val === true, {
        message: "You must accept the terms and policy to proceed.",
      }),
  }),
});

export type ContactMessageInput = z.infer<typeof contactMessageSchema>["body"];
