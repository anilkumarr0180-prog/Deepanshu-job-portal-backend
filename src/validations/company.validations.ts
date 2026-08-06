import { z } from "zod";
import { Types } from "mongoose";

const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: "Invalid company ID format.",
});

const urlSchema = z
  .string()
  .trim()
  .url("Must be a valid URL.")
  .optional()
  .or(z.literal(""));

/*
|--------------------------------------------------------------------------
| Create Company Validation Schema
|--------------------------------------------------------------------------
*/
export const createCompanySchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Company name must be at least 2 characters.")
      .max(100, "Company name cannot exceed 100 characters."),

    description: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters."),

    logo: urlSchema,
    website: urlSchema,
    industry: z.string().trim().optional(),
    companySize: z.string().trim().optional(),
    foundedYear: z
      .number()
      .int()
      .min(1800, "Founded year must be valid.")
      .max(new Date().getFullYear(), "Founded year cannot be in the future.")
      .optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email format.")
      .optional()
      .or(z.literal("")),
    phone: z.string().trim().optional(),
    address: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    country: z.string().trim().optional(),

    socialLinks: z
      .object({
        linkedin: urlSchema,
        twitter: urlSchema,
        github: urlSchema,
        website: urlSchema,
      })
      .optional(),
  }),
});

/*
|--------------------------------------------------------------------------
| Update Company Validation Schema
|--------------------------------------------------------------------------
*/
export const updateCompanySchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(2, "Company name must be at least 2 characters.")
      .max(100, "Company name cannot exceed 100 characters.")
      .optional(),

    description: z
      .string()
      .trim()
      .min(10, "Description must be at least 10 characters.")
      .optional(),

    logo: urlSchema,
    website: urlSchema,
    industry: z.string().trim().optional(),
    companySize: z.string().trim().optional(),
    foundedYear: z
      .number()
      .int()
      .min(1800, "Founded year must be valid.")
      .max(new Date().getFullYear(), "Founded year cannot be in the future.")
      .optional(),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email("Invalid email format.")
      .optional()
      .or(z.literal("")),
    phone: z.string().trim().optional(),
    address: z.string().trim().optional(),
    city: z.string().trim().optional(),
    state: z.string().trim().optional(),
    country: z.string().trim().optional(),

    socialLinks: z
      .object({
        linkedin: urlSchema,
        twitter: urlSchema,
        github: urlSchema,
        website: urlSchema,
      })
      .optional(),
  }),
});

/*
|--------------------------------------------------------------------------
| Get Companies Query Validation Schema
|--------------------------------------------------------------------------
*/
export const getCompaniesQuerySchema = z.object({
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
      industry: z.string().trim().optional(),
      sort: z
        .enum(["newest", "oldest", "name-asc", "name-desc"])
        .optional(),
    })
    .optional(),
});

/*
|--------------------------------------------------------------------------
| Company ID Param Validation Schema
|--------------------------------------------------------------------------
*/
export const companyIdParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});
