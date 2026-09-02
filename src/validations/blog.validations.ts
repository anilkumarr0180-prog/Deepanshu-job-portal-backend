import { z } from "zod";
import { BLOG_STATUS } from "../constants/blog-status";

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

export const blogIdParamSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, "Invalid blog ID format."),
  }),
});

export const blogSlugParamSchema = z.object({
  params: z.object({
    slug: z.string().trim().min(1, "Blog slug is required."),
  }),
});

const seoSchema = z.object({
  metaTitle: z.string().trim().max(150, "Meta title cannot exceed 150 characters.").optional().or(z.literal("")),
  metaDescription: z.string().trim().max(300, "Meta description cannot exceed 300 characters.").optional().or(z.literal("")),
  keywords: z.array(z.string().trim()).optional(),
  canonicalUrl: z.string().trim().optional().or(z.literal("")),
});

const statusSchema = z.preprocess(
  (val) => (typeof val === "string" ? val.toLowerCase() : val),
  z.enum([BLOG_STATUS.DRAFT, BLOG_STATUS.PUBLISHED, BLOG_STATUS.ARCHIVED])
);

export const createBlogSchema = z.object({
  body: z.object({
    title: z
      .string()
      .trim()
      .min(3, "Title must be at least 3 characters.")
      .max(250, "Title cannot exceed 250 characters."),
    slug: z
      .string()
      .trim()
      .min(1, "Slug must be at least 1 character.")
      .max(300, "Slug cannot exceed 300 characters.")
      .optional()
      .or(z.literal("")),
    excerpt: z
      .string()
      .trim()
      .min(10, "Excerpt must be at least 10 characters.")
      .max(600, "Excerpt cannot exceed 600 characters."),
    content: z
      .string()
      .trim()
      .min(10, "Content must be at least 10 characters."),
    categoryId: z
      .string()
      .regex(objectIdRegex, "Invalid category ID format."),
    coverImageUrl: z.string().trim().optional().or(z.literal("")),
    coverImagePublicId: z.string().trim().optional().or(z.literal("")),
    coverImageAlt: z.string().trim().max(200, "Alt text cannot exceed 200 characters.").optional().or(z.literal("")),
    tags: z.array(z.string().trim()).optional(),
    readingTime: z.number().int().min(1, "Reading time must be at least 1 minute.").optional(),
    status: statusSchema.optional(),
    isFeatured: z.boolean().optional(),
    isTrending: z.boolean().optional(),
    publishedAt: z.string().datetime().optional().or(z.literal("")),
    seo: seoSchema.optional(),
  }),
});

export const updateBlogSchema = z.object({
  params: z.object({
    id: z.string().regex(objectIdRegex, "Invalid blog ID format."),
  }),
  body: z
    .object({
      title: z
        .string()
        .trim()
        .min(3, "Title must be at least 3 characters.")
        .max(250, "Title cannot exceed 250 characters.")
        .optional(),
      slug: z
        .string()
        .trim()
        .min(3, "Slug must be at least 3 characters.")
        .max(300, "Slug cannot exceed 300 characters.")
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must only contain lowercase alphanumeric characters and single hyphens.")
        .optional(),
      excerpt: z
        .string()
        .trim()
        .min(10, "Excerpt must be at least 10 characters.")
        .max(600, "Excerpt cannot exceed 600 characters.")
        .optional(),
      content: z
        .string()
        .trim()
        .min(10, "Content must be at least 10 characters.")
        .optional(),
      categoryId: z
        .string()
        .regex(objectIdRegex, "Invalid category ID format.")
        .optional(),
      coverImageUrl: z.string().trim().nullable().optional().or(z.literal("")),
      coverImagePublicId: z.string().trim().nullable().optional().or(z.literal("")),
      coverImageAlt: z.string().trim().max(200, "Alt text cannot exceed 200 characters.").optional().or(z.literal("")),
      tags: z.array(z.string().trim()).optional(),
      readingTime: z.number().int().min(1, "Reading time must be at least 1 minute.").optional(),
      status: statusSchema.optional(),
      isFeatured: z.boolean().optional(),
      isTrending: z.boolean().optional(),
      publishedAt: z.string().datetime().nullable().optional().or(z.literal("")),
      seo: seoSchema.optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided for update.",
    }),
});

export const getPublicBlogsQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/, "Page must be a positive integer.").optional(),
    limit: z.string().regex(/^\d+$/, "Limit must be a positive integer.").optional(),
    category: z.string().trim().optional(),
    tag: z.string().trim().optional(),
    search: z.string().trim().optional(),
    sort: z.enum(["newest", "oldest", "popular", "trending"]).optional(),
  }),
});

export const getAdminBlogsQuerySchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/, "Page must be a positive integer.").optional(),
    limit: z.string().regex(/^\d+$/, "Limit must be a positive integer.").optional(),
    status: z.enum([BLOG_STATUS.DRAFT, BLOG_STATUS.PUBLISHED, BLOG_STATUS.ARCHIVED, "all"]).optional(),
    category: z.string().trim().optional(),
    search: z.string().trim().optional(),
    isFeatured: z.enum(["true", "false"]).optional(),
    isTrending: z.enum(["true", "false"]).optional(),
    sort: z.enum(["newest", "oldest", "views", "title"]).optional(),
  }),
});
