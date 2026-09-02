export const BLOG_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
  ARCHIVED: "archived",
} as const;

export type BlogStatus = (typeof BLOG_STATUS)[keyof typeof BLOG_STATUS];
