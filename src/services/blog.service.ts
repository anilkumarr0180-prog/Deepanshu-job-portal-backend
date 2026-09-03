import { Types } from "mongoose";
import Blog, { IBlog } from "../models/blog.model";
import BlogCategory, { IBlogCategory } from "../models/blog-category.model";
import User from "../models/user.model";
import cloudinaryService from "./cloudinary.service";
import { createBulkNotifications } from "./notification.service";
import { getAcceptedConnectionUserIds } from "./connection.service";
import { sendBlogPublishedEmail } from "./email.service";
import { NOTIFICATION_TYPES } from "../constants/notification-type";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { BLOG_STATUS, BlogStatus } from "../constants/blog-status";
import { getPaginationOptions, buildPaginatedResult } from "../utils/pagination";

/*
|--------------------------------------------------------------------------
| Blog Publishing Notification Helper
|--------------------------------------------------------------------------
|
| Dispatches real-time Socket.IO notifications, calculates unread count,
| and triggers best-effort transactional emails strictly to accepted
| connections of the blog author.
| Fully error-isolated to protect the primary blog publishing transaction.
|
|--------------------------------------------------------------------------
*/
export const notifyConnectedUsersOnBlogPublish = async (
  blog: IBlog | (Record<string, any> & { _id: Types.ObjectId | string; authorId: any; title: string; slug: string; excerpt?: string })
): Promise<void> => {
  try {
    const rawAuthorId = blog.authorId?._id || blog.authorId;
    if (!rawAuthorId) return;
    const authorId = rawAuthorId.toString();

    // 1. Lookup accepted connection user IDs (bidirectional, excludes author)
    const connectedRecipientIds = await getAcceptedConnectionUserIds(authorId);
    if (!connectedRecipientIds || connectedRecipientIds.length === 0) {
      return;
    }

    // 2. Fetch author details for notification text
    const author = await User.findById(authorId).select("name email").lean();
    const authorName = author?.name || "A professional in your network";

    // 3. Bulk create notifications and emit Socket.IO events with updated unread counts
    const notificationPayload = {
      recipientIds: connectedRecipientIds,
      senderId: authorId,
      type: NOTIFICATION_TYPES.BLOG_PUBLISHED,
      title: "New Blog from Your Connection",
      body: `${authorName} published a new article: "${blog.title}"`,
      link: `/blog/${blog.slug}`,
      metadata: {
        blogId: blog._id.toString(),
        slug: blog.slug,
        authorId,
      },
    };

    await createBulkNotifications(notificationPayload);

    // 4. Asynchronous best-effort email dispatch in background
    setImmediate(async () => {
      try {
        const recipients = await User.find({
          _id: { $in: connectedRecipientIds.map((id) => new Types.ObjectId(id)) },
          isBlocked: false,
          isDeleted: false,
        })
          .select("name email")
          .lean();

        for (const recipient of recipients) {
          if (recipient.email) {
            await sendBlogPublishedEmail({
              recipientEmail: recipient.email,
              recipientName: recipient.name,
              authorName,
              blogTitle: blog.title,
              blogSlug: blog.slug,
              excerpt: blog.excerpt,
            }).catch((err) => {
              console.error(`[Blog Email] Failed to send blog published email to ${recipient.email}:`, err);
            });
          }
        }
      } catch (emailErr) {
        console.error("[Blog Email] Error dispatching blog published emails:", emailErr);
      }
    });
  } catch (err) {
    console.error("Failed to notify connected users on blog publication:", err);
  }
};

export interface CreateBlogInput {
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
  categoryId: string;
  coverImageUrl?: string;
  coverImagePublicId?: string;
  coverImageAlt?: string;
  tags?: string[];
  readingTime?: number;
  status?: BlogStatus;
  isFeatured?: boolean;
  isTrending?: boolean;
  publishedAt?: string;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    canonicalUrl?: string;
  };
}

export interface UpdateBlogInput {
  title?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  categoryId?: string;
  coverImageUrl?: string | null;
  coverImagePublicId?: string | null;
  coverImageAlt?: string;
  tags?: string[];
  readingTime?: number;
  status?: BlogStatus;
  isFeatured?: boolean;
  isTrending?: boolean;
  publishedAt?: string | null;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    canonicalUrl?: string;
  };
}

export interface PublicBlogFilters {
  page?: string | number;
  limit?: string | number;
  category?: string;
  tag?: string;
  search?: string;
  sort?: "newest" | "oldest" | "popular" | "trending";
}

export interface AdminBlogFilters {
  page?: string | number;
  limit?: string | number;
  status?: BlogStatus | "all";
  category?: string;
  search?: string;
  isFeatured?: "true" | "false";
  isTrending?: "true" | "false";
  sort?: "newest" | "oldest" | "views" | "title";
}

export interface CandidateBlogFilters {
  page?: string | number;
  limit?: string | number;
  status?: BlogStatus | "all";
  category?: string;
  search?: string;
  sort?: "newest" | "oldest" | "views" | "title";
}

export interface CreateCandidateBlogInput {
  title: string;
  slug?: string;
  excerpt: string;
  content: string;
  categoryId: string;
  coverImageUrl?: string;
  coverImagePublicId?: string;
  coverImageAlt?: string;
  tags?: string[];
  readingTime?: number;
  status?: BlogStatus;
  publishedAt?: string;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    canonicalUrl?: string;
  };
}

export interface UpdateCandidateBlogInput {
  title?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  categoryId?: string;
  coverImageUrl?: string | null;
  coverImagePublicId?: string | null;
  coverImageAlt?: string;
  tags?: string[];
  readingTime?: number;
  status?: BlogStatus;
  publishedAt?: string | null;
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string[];
    canonicalUrl?: string;
  };
}

export function slugify(text: string): string {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove all non-word chars except space and hyphen
    .replace(/[\s_-]+/g, "-") // Replace spaces, underscores, and multiple hyphens with single -
    .replace(/^-+|-+$/g, ""); // Trim leading/trailing hyphens
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function calculateReadingTime(content: string): number {
  if (!content) return 1;
  const clean = content.replace(/<[^>]*>?/gm, "").replace(/[#*`_~[\]]/g, "");
  const words = clean.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export async function generateUniqueSlug(title: string, existingId?: string): Promise<string> {
  const baseSlug = slugify(title) || "untitled-blog";
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const query: Record<string, any> = { slug };
    if (existingId && Types.ObjectId.isValid(existingId)) {
      query._id = { $ne: new Types.ObjectId(existingId) };
    }

    const existing = await Blog.findOne(query).select("_id").lean();
    if (!existing) {
      return slug;
    }

    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
}

/*
|--------------------------------------------------------------------------
| Public Blog Services
|--------------------------------------------------------------------------
*/

export const getBlogCategories = async (): Promise<IBlogCategory[]> => {
  return BlogCategory.find({ isDeleted: false }).sort({ name: 1 }).lean();
};


export const getPublicBlogs = async (filters: PublicBlogFilters) => {
  const { page, limit, skip } = getPaginationOptions({
    page: filters.page,
    limit: filters.limit,
  });

  const query: Record<string, any> = {
    status: BLOG_STATUS.PUBLISHED,
    isDeleted: false,
  };

  // Filter by category slug or ObjectId
  if (filters.category && filters.category.trim() !== "") {
    const categoryInput = filters.category.trim();
    if (Types.ObjectId.isValid(categoryInput)) {
      query.categoryId = new Types.ObjectId(categoryInput);
    } else {
      const foundCategory = await BlogCategory.findOne({
        slug: categoryInput.toLowerCase(),
        isDeleted: false,
      }).select("_id");

      if (foundCategory) {
        query.categoryId = foundCategory._id;
      } else {
        // Unknown category slug -> return empty page
        return buildPaginatedResult([], 0, page, limit);
      }
    }
  }

  // Filter by tag
  if (filters.tag && filters.tag.trim() !== "") {
    query.tags = filters.tag.trim().toLowerCase();
  }

  // Search keyword across title, excerpt, and tags
  if (filters.search && filters.search.trim() !== "") {
    const searchRegex = new RegExp(escapeRegex(filters.search.trim()), "i");
    query.$or = [
      { title: searchRegex },
      { excerpt: searchRegex },
      { tags: searchRegex },
    ];
  }

  // Sort criteria
  let sortOptions: Record<string, 1 | -1> = { publishedAt: -1, createdAt: -1 };
  if (filters.sort === "oldest") {
    sortOptions = { publishedAt: 1, createdAt: 1 };
  } else if (filters.sort === "popular") {
    sortOptions = { viewsCount: -1, publishedAt: -1 };
  } else if (filters.sort === "trending") {
    sortOptions = { isTrending: -1, publishedAt: -1 };
  }

  const [items, totalItems] = await Promise.all([
    Blog.find(query)
      .populate("authorId", "name email profilePicture role")
      .populate("categoryId", "name slug description")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    Blog.countDocuments(query),
  ]);

  return buildPaginatedResult(items, totalItems, page, limit);
};

export const getBlogBySlug = async (slug: string) => {
  if (!slug || slug.trim() === "") {
    throw new AppError("Blog slug is required.", HTTP_STATUS.BAD_REQUEST);
  }

  const normalizedSlug = slug.trim().toLowerCase();

  // Atomically increment views count and fetch
  const blog = await Blog.findOneAndUpdate(
    {
      slug: normalizedSlug,
      status: BLOG_STATUS.PUBLISHED,
      isDeleted: false,
    },
    { $inc: { viewsCount: 1 } },
    { returnDocument: "after" }
  )
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .lean();

  if (!blog) {
    throw new AppError("Blog post not found or unpublished.", HTTP_STATUS.NOT_FOUND);
  }

  return blog;
};

export const getTrendingBlogs = async (limitNum = 6) => {
  const limit = Math.min(Math.max(1, Number(limitNum) || 6), 20);

  let blogs = await Blog.find({
    status: BLOG_STATUS.PUBLISHED,
    isDeleted: false,
    isTrending: true,
  })
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean();

  // If fewer than requested trending blogs, backfill with most viewed
  if (blogs.length < limit) {
    const existingIds = blogs.map((b) => b._id);
    const backfill = await Blog.find({
      status: BLOG_STATUS.PUBLISHED,
      isDeleted: false,
      _id: { $nin: existingIds },
    })
      .populate("authorId", "name email profilePicture role")
      .populate("categoryId", "name slug description")
      .sort({ viewsCount: -1, publishedAt: -1 })
      .limit(limit - blogs.length)
      .lean();

    blogs = [...blogs, ...backfill];
  }

  return blogs;
};

export const getFeaturedBlogs = async (limitNum = 6) => {
  const limit = Math.min(Math.max(1, Number(limitNum) || 6), 20);

  const blogs = await Blog.find({
    status: BLOG_STATUS.PUBLISHED,
    isDeleted: false,
    isFeatured: true,
  })
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .sort({ publishedAt: -1 })
    .limit(limit)
    .lean();

  return blogs;
};

/*
|--------------------------------------------------------------------------
| Admin Blog Services
|--------------------------------------------------------------------------
*/

export const getAdminBlogs = async (filters: AdminBlogFilters) => {
  const { page, limit, skip } = getPaginationOptions({
    page: filters.page,
    limit: filters.limit,
  });

  const query: Record<string, any> = { isDeleted: false };

  if (filters.status && filters.status !== "all") {
    query.status = filters.status;
  }

  if (filters.category && filters.category.trim() !== "") {
    const cat = filters.category.trim();
    if (Types.ObjectId.isValid(cat)) {
      query.categoryId = new Types.ObjectId(cat);
    } else {
      const foundCategory = await BlogCategory.findOne({
        slug: cat.toLowerCase(),
        isDeleted: false,
      }).select("_id");
      if (foundCategory) {
        query.categoryId = foundCategory._id;
      }
    }
  }

  if (filters.isFeatured !== undefined) {
    query.isFeatured = filters.isFeatured === "true";
  }

  if (filters.isTrending !== undefined) {
    query.isTrending = filters.isTrending === "true";
  }

  if (filters.search && filters.search.trim() !== "") {
    const searchRegex = new RegExp(escapeRegex(filters.search.trim()), "i");
    query.$or = [
      { title: searchRegex },
      { slug: searchRegex },
      { excerpt: searchRegex },
      { tags: searchRegex },
    ];
  }

  let sortOptions: Record<string, 1 | -1> = { createdAt: -1 };
  if (filters.sort === "oldest") sortOptions = { createdAt: 1 };
  else if (filters.sort === "views") sortOptions = { viewsCount: -1 };
  else if (filters.sort === "title") sortOptions = { title: 1 };

  const [items, totalItems] = await Promise.all([
    Blog.find(query)
      .populate("authorId", "name email profilePicture role")
      .populate("categoryId", "name slug description")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    Blog.countDocuments(query),
  ]);

  return buildPaginatedResult(items, totalItems, page, limit);
};

export const getAdminBlogById = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid blog ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  const blog = await Blog.findOne({ _id: id, isDeleted: false })
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .lean();

  if (!blog) {
    throw new AppError("Blog not found.", HTTP_STATUS.NOT_FOUND);
  }

  return blog;
};

export const createBlog = async (input: CreateBlogInput, authorId: string) => {
  if (!Types.ObjectId.isValid(authorId)) {
    throw new AppError("Invalid authenticated author ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  if (!Types.ObjectId.isValid(input.categoryId)) {
    throw new AppError("Invalid category ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  const categoryExists = await BlogCategory.findOne({
    _id: input.categoryId,
    isDeleted: false,
  });

  if (!categoryExists) {
    throw new AppError("Selected blog category does not exist.", HTTP_STATUS.BAD_REQUEST);
  }

  const slug = input.slug
    ? await generateUniqueSlug(input.slug)
    : await generateUniqueSlug(input.title);

  const readingTime = input.readingTime || calculateReadingTime(input.content);
  const status = input.status || BLOG_STATUS.DRAFT;
  const publishedAt =
    status === BLOG_STATUS.PUBLISHED
      ? input.publishedAt
        ? new Date(input.publishedAt)
        : new Date()
      : input.publishedAt
      ? new Date(input.publishedAt)
      : undefined;

  const blog = await Blog.create({
    title: input.title.trim(),
    slug,
    excerpt: input.excerpt.trim(),
    content: input.content,
    categoryId: new Types.ObjectId(input.categoryId),
    authorId: new Types.ObjectId(authorId),
    coverImageUrl: input.coverImageUrl?.trim() || undefined,
    coverImagePublicId: input.coverImagePublicId?.trim() || undefined,
    coverImageAlt: input.coverImageAlt?.trim() || undefined,
    tags: input.tags ? input.tags.map((t) => t.trim().toLowerCase()) : [],
    readingTime,
    status,
    isFeatured: Boolean(input.isFeatured),
    isTrending: Boolean(input.isTrending),
    publishedAt,
    seo: input.seo || {},
    viewsCount: 0,
    isDeleted: false,
  });

  const populated = await Blog.findById(blog._id)
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .lean();

  if (status === BLOG_STATUS.PUBLISHED) {
    void notifyConnectedUsersOnBlogPublish(populated || blog);
  }

  return populated || blog;
};

export const updateBlog = async (id: string, input: UpdateBlogInput) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid blog ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  const blog = await Blog.findOne({ _id: id, isDeleted: false });
  if (!blog) {
    throw new AppError("Blog not found.", HTTP_STATUS.NOT_FOUND);
  }

  const wasAlreadyPublished = blog.status === BLOG_STATUS.PUBLISHED;

  if (input.categoryId && input.categoryId !== blog.categoryId.toString()) {
    if (!Types.ObjectId.isValid(input.categoryId)) {
      throw new AppError("Invalid category ID format.", HTTP_STATUS.BAD_REQUEST);
    }
    const categoryExists = await BlogCategory.findOne({
      _id: input.categoryId,
      isDeleted: false,
    });
    if (!categoryExists) {
      throw new AppError("Selected blog category does not exist.", HTTP_STATUS.BAD_REQUEST);
    }
    blog.categoryId = new Types.ObjectId(input.categoryId);
  }

  if (input.title !== undefined) {
    blog.title = input.title.trim();
  }

  if (input.slug !== undefined && input.slug.trim() !== "") {
    blog.slug = await generateUniqueSlug(input.slug, id);
  }

  if (input.excerpt !== undefined) {
    blog.excerpt = input.excerpt.trim();
  }

  if (input.content !== undefined) {
    blog.content = input.content;
    if (!input.readingTime) {
      blog.readingTime = calculateReadingTime(input.content);
    }
  }

  if (input.readingTime !== undefined) {
    blog.readingTime = input.readingTime;
  }

  if (input.tags !== undefined) {
    blog.tags = input.tags.map((t) => t.trim().toLowerCase());
  }

  if (input.isFeatured !== undefined) {
    blog.isFeatured = Boolean(input.isFeatured);
  }

  if (input.isTrending !== undefined) {
    blog.isTrending = Boolean(input.isTrending);
  }

  // Cover image asset change cleanup
  if (
    input.coverImagePublicId !== undefined &&
    blog.coverImagePublicId &&
    blog.coverImagePublicId !== input.coverImagePublicId
  ) {
    const oldPublicId = blog.coverImagePublicId;
    try {
      await cloudinaryService.deleteAsset(oldPublicId, "image");
    } catch (err) {
      console.error("Failed to delete superseded blog cover image on Cloudinary:", err);
    }
  }

  if (input.coverImageUrl !== undefined) {
    blog.coverImageUrl = input.coverImageUrl ? input.coverImageUrl.trim() : undefined;
  }

  if (input.coverImagePublicId !== undefined) {
    blog.coverImagePublicId = input.coverImagePublicId ? input.coverImagePublicId.trim() : undefined;
  }

  if (input.coverImageAlt !== undefined) {
    blog.coverImageAlt = input.coverImageAlt ? input.coverImageAlt.trim() : undefined;
  }

  if (input.status !== undefined) {
    blog.status = input.status;
    if (input.status === BLOG_STATUS.PUBLISHED && !blog.publishedAt) {
      blog.publishedAt = new Date();
    }
  }

  if (input.publishedAt !== undefined) {
    blog.publishedAt = input.publishedAt ? new Date(input.publishedAt) : undefined;
  }

  if (input.seo !== undefined) {
    blog.seo = {
      metaTitle: input.seo.metaTitle?.trim(),
      metaDescription: input.seo.metaDescription?.trim(),
      keywords: input.seo.keywords ? input.seo.keywords.map((k) => k.trim()) : [],
      canonicalUrl: input.seo.canonicalUrl?.trim(),
    };
  }

  await blog.save();

  const populated = await Blog.findById(blog._id)
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .lean();

  if (!wasAlreadyPublished && blog.status === BLOG_STATUS.PUBLISHED) {
    void notifyConnectedUsersOnBlogPublish(populated || blog);
  }

  return populated || blog;
};

export const deleteBlog = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid blog ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  const blog = await Blog.findOne({ _id: id, isDeleted: false });
  if (!blog) {
    throw new AppError("Blog not found.", HTTP_STATUS.NOT_FOUND);
  }

  blog.isDeleted = true;
  await blog.save();

  if (blog.coverImagePublicId) {
    try {
      await cloudinaryService.deleteAsset(blog.coverImagePublicId, "image");
    } catch (err) {
      console.error("Failed to delete blog cover image from Cloudinary:", err);
    }
  }

  return { success: true, message: "Blog deleted successfully." };
};

export const publishBlog = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid blog ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  const blog = await Blog.findOne({ _id: id, isDeleted: false });
  if (!blog) {
    throw new AppError("Blog not found.", HTTP_STATUS.NOT_FOUND);
  }

  const wasAlreadyPublished = blog.status === BLOG_STATUS.PUBLISHED;

  blog.status = BLOG_STATUS.PUBLISHED;
  if (!blog.publishedAt) {
    blog.publishedAt = new Date();
  }

  await blog.save();

  const populated = await Blog.findById(blog._id)
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .lean();

  if (!wasAlreadyPublished) {
    void notifyConnectedUsersOnBlogPublish(populated || blog);
  }

  return populated;
};

export const unpublishBlog = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid blog ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  const blog = await Blog.findOne({ _id: id, isDeleted: false });
  if (!blog) {
    throw new AppError("Blog not found.", HTTP_STATUS.NOT_FOUND);
  }

  blog.status = BLOG_STATUS.DRAFT;
  await blog.save();

  return Blog.findById(blog._id)
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .lean();
};

export const archiveBlog = async (id: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid blog ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  const blog = await Blog.findOne({ _id: id, isDeleted: false });
  if (!blog) {
    throw new AppError("Blog not found.", HTTP_STATUS.NOT_FOUND);
  }

  blog.status = BLOG_STATUS.ARCHIVED;
  await blog.save();

  return Blog.findById(blog._id)
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .lean();
};

/*
|--------------------------------------------------------------------------
| Candidate / Author Blog Services
|--------------------------------------------------------------------------
|
| Enforces strict server-side ownership checks:
| blog.authorId === authenticatedUserId
|
| Unauthorized / unowned requests return HTTP 404 Not Found to prevent
| information leakage about other users' private drafts or blogs.
|
|--------------------------------------------------------------------------
*/

export const getCandidateBlogs = async (
  userId: string,
  filters: CandidateBlogFilters
) => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid authenticated author ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const { page, limit, skip } = getPaginationOptions({
    page: filters.page,
    limit: filters.limit,
  });

  const query: Record<string, any> = {
    authorId: new Types.ObjectId(userId),
    isDeleted: false,
  };

  if (filters.status && filters.status !== "all") {
    query.status = filters.status;
  }

  if (filters.category && filters.category.trim() !== "") {
    const cat = filters.category.trim();
    if (Types.ObjectId.isValid(cat)) {
      query.categoryId = new Types.ObjectId(cat);
    } else {
      const foundCategory = await BlogCategory.findOne({
        slug: cat.toLowerCase(),
        isDeleted: false,
      }).select("_id");
      if (foundCategory) {
        query.categoryId = foundCategory._id;
      } else {
        return buildPaginatedResult([], 0, page, limit);
      }
    }
  }

  if (filters.search && filters.search.trim() !== "") {
    const searchRegex = new RegExp(escapeRegex(filters.search.trim()), "i");
    query.$or = [
      { title: searchRegex },
      { slug: searchRegex },
      { excerpt: searchRegex },
      { tags: searchRegex },
    ];
  }

  let sortOptions: Record<string, 1 | -1> = { createdAt: -1 };
  if (filters.sort === "oldest") sortOptions = { createdAt: 1 };
  else if (filters.sort === "views") sortOptions = { viewsCount: -1 };
  else if (filters.sort === "title") sortOptions = { title: 1 };

  const [items, totalItems] = await Promise.all([
    Blog.find(query)
      .populate("authorId", "name email profilePicture role")
      .populate("categoryId", "name slug description")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    Blog.countDocuments(query),
  ]);

  return buildPaginatedResult(items, totalItems, page, limit);
};

export const getCandidateBlogById = async (id: string, userId: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid blog ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid authenticated author ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const blog = await Blog.findOne({
    _id: id,
    authorId: new Types.ObjectId(userId),
    isDeleted: false,
  })
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .lean();

  if (!blog) {
    throw new AppError("Blog not found.", HTTP_STATUS.NOT_FOUND);
  }

  return blog;
};

export const createCandidateBlog = async (
  input: CreateCandidateBlogInput,
  userId: string
) => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid authenticated author ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  if (!Types.ObjectId.isValid(input.categoryId)) {
    throw new AppError("Invalid category ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  const categoryExists = await BlogCategory.findOne({
    _id: input.categoryId,
    isDeleted: false,
  });

  if (!categoryExists) {
    throw new AppError("Selected blog category does not exist.", HTTP_STATUS.BAD_REQUEST);
  }

  const slug = input.slug
    ? await generateUniqueSlug(input.slug)
    : await generateUniqueSlug(input.title);

  const readingTime = input.readingTime || calculateReadingTime(input.content);
  const status =
    input.status === BLOG_STATUS.PUBLISHED
      ? BLOG_STATUS.PUBLISHED
      : BLOG_STATUS.DRAFT;

  const publishedAt =
    status === BLOG_STATUS.PUBLISHED
      ? input.publishedAt
        ? new Date(input.publishedAt)
        : new Date()
      : undefined;

  const blog = await Blog.create({
    title: input.title.trim(),
    slug,
    excerpt: input.excerpt.trim(),
    content: input.content,
    categoryId: new Types.ObjectId(input.categoryId),
    authorId: new Types.ObjectId(userId),
    coverImageUrl: input.coverImageUrl?.trim() || undefined,
    coverImagePublicId: input.coverImagePublicId?.trim() || undefined,
    coverImageAlt: input.coverImageAlt?.trim() || undefined,
    tags: input.tags ? input.tags.map((t) => t.trim().toLowerCase()) : [],
    readingTime,
    status,
    isFeatured: false,
    isTrending: false,
    publishedAt,
    seo: input.seo || {},
    viewsCount: 0,
    isDeleted: false,
  });

  const populated = await Blog.findById(blog._id)
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .lean();

  if (status === BLOG_STATUS.PUBLISHED) {
    void notifyConnectedUsersOnBlogPublish(populated || blog);
  }

  return populated || blog;
};

export const updateCandidateBlog = async (
  id: string,
  input: UpdateCandidateBlogInput,
  userId: string
) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid blog ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid authenticated author ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const blog = await Blog.findOne({
    _id: id,
    authorId: new Types.ObjectId(userId),
    isDeleted: false,
  });

  if (!blog) {
    throw new AppError("Blog not found.", HTTP_STATUS.NOT_FOUND);
  }

  const wasAlreadyPublished = blog.status === BLOG_STATUS.PUBLISHED;

  if (input.categoryId && input.categoryId !== blog.categoryId.toString()) {
    if (!Types.ObjectId.isValid(input.categoryId)) {
      throw new AppError("Invalid category ID format.", HTTP_STATUS.BAD_REQUEST);
    }
    const categoryExists = await BlogCategory.findOne({
      _id: input.categoryId,
      isDeleted: false,
    });
    if (!categoryExists) {
      throw new AppError("Selected blog category does not exist.", HTTP_STATUS.BAD_REQUEST);
    }
    blog.categoryId = new Types.ObjectId(input.categoryId);
  }

  if (input.title !== undefined) {
    blog.title = input.title.trim();
  }

  if (input.slug !== undefined && input.slug.trim() !== "") {
    blog.slug = await generateUniqueSlug(input.slug, id);
  }

  if (input.excerpt !== undefined) {
    blog.excerpt = input.excerpt.trim();
  }

  if (input.content !== undefined) {
    blog.content = input.content;
    if (!input.readingTime) {
      blog.readingTime = calculateReadingTime(input.content);
    }
  }

  if (input.readingTime !== undefined) {
    blog.readingTime = input.readingTime;
  }

  if (input.tags !== undefined) {
    blog.tags = input.tags.map((t) => t.trim().toLowerCase());
  }

  // Cover image asset change cleanup
  if (
    input.coverImagePublicId !== undefined &&
    blog.coverImagePublicId &&
    blog.coverImagePublicId !== input.coverImagePublicId
  ) {
    const oldPublicId = blog.coverImagePublicId;
    try {
      await cloudinaryService.deleteAsset(oldPublicId, "image");
    } catch (err) {
      console.error("Failed to delete superseded blog cover image on Cloudinary:", err);
    }
  }

  if (input.coverImageUrl !== undefined) {
    blog.coverImageUrl = input.coverImageUrl ? input.coverImageUrl.trim() : undefined;
  }

  if (input.coverImagePublicId !== undefined) {
    blog.coverImagePublicId = input.coverImagePublicId ? input.coverImagePublicId.trim() : undefined;
  }

  if (input.coverImageAlt !== undefined) {
    blog.coverImageAlt = input.coverImageAlt ? input.coverImageAlt.trim() : undefined;
  }

  if (input.status !== undefined) {
    if (input.status === BLOG_STATUS.PUBLISHED) {
      blog.status = BLOG_STATUS.PUBLISHED;
      if (!blog.publishedAt) {
        blog.publishedAt = input.publishedAt ? new Date(input.publishedAt) : new Date();
      }
    } else if (input.status === BLOG_STATUS.DRAFT) {
      blog.status = BLOG_STATUS.DRAFT;
      blog.publishedAt = undefined;
    }
  }

  if (input.seo !== undefined) {
    blog.seo = {
      metaTitle: input.seo.metaTitle?.trim(),
      metaDescription: input.seo.metaDescription?.trim(),
      keywords: input.seo.keywords ? input.seo.keywords.map((k) => k.trim()) : [],
      canonicalUrl: input.seo.canonicalUrl?.trim(),
    };
  }

  await blog.save();

  const populated = await Blog.findById(blog._id)
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .lean();

  if (!wasAlreadyPublished && blog.status === BLOG_STATUS.PUBLISHED) {
    void notifyConnectedUsersOnBlogPublish(populated || blog);
  }

  return populated || blog;
};

export const publishCandidateBlog = async (id: string, userId: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid blog ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid authenticated author ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const blog = await Blog.findOne({
    _id: id,
    authorId: new Types.ObjectId(userId),
    isDeleted: false,
  });

  if (!blog) {
    throw new AppError("Blog not found.", HTTP_STATUS.NOT_FOUND);
  }

  const wasAlreadyPublished = blog.status === BLOG_STATUS.PUBLISHED;

  blog.status = BLOG_STATUS.PUBLISHED;
  if (!blog.publishedAt) {
    blog.publishedAt = new Date();
  }

  await blog.save();

  const populated = await Blog.findById(blog._id)
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .lean();

  if (!wasAlreadyPublished) {
    void notifyConnectedUsersOnBlogPublish(populated || blog);
  }

  return populated;
};

export const unpublishCandidateBlog = async (id: string, userId: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid blog ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid authenticated author ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const blog = await Blog.findOne({
    _id: id,
    authorId: new Types.ObjectId(userId),
    isDeleted: false,
  });

  if (!blog) {
    throw new AppError("Blog not found.", HTTP_STATUS.NOT_FOUND);
  }

  blog.status = BLOG_STATUS.DRAFT;
  blog.publishedAt = undefined;

  await blog.save();

  return Blog.findById(blog._id)
    .populate("authorId", "name email profilePicture role")
    .populate("categoryId", "name slug description")
    .lean();
};

export const deleteCandidateBlog = async (id: string, userId: string) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new AppError("Invalid blog ID format.", HTTP_STATUS.BAD_REQUEST);
  }

  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid authenticated author ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const blog = await Blog.findOne({
    _id: id,
    authorId: new Types.ObjectId(userId),
    isDeleted: false,
  });

  if (!blog) {
    throw new AppError("Blog not found.", HTTP_STATUS.NOT_FOUND);
  }

  blog.isDeleted = true;
  await blog.save();

  if (blog.coverImagePublicId) {
    try {
      await cloudinaryService.deleteAsset(blog.coverImagePublicId, "image");
    } catch (err) {
      console.error("Failed to delete blog cover image from Cloudinary:", err);
    }
  }

  return { success: true, message: "Blog deleted successfully." };
};
