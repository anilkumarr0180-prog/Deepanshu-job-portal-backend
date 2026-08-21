import { Types } from "mongoose";
import Post from "../models/post.model";
import PostReaction from "../models/post-reaction.model";
import cloudinaryService from "./cloudinary.service";
import { validatePostMedia } from "../validations/post.validations";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import {
  getPaginationOptions,
  buildPaginatedResult,
} from "../utils/pagination";

interface CreatePostInput {
  content: string;
  mediaUrl?: string;
  mediaPublicId?: string;
}

interface UpdatePostInput {
  content?: string;
  mediaUrl?: string | null;
  mediaPublicId?: string | null;
}

interface PostFilters {
  page?: string | number;
  limit?: string | number;
  sort?: "newest" | "oldest";
}

/*
|--------------------------------------------------------------------------
| Create Post
|--------------------------------------------------------------------------
|
| The authorId is NEVER accepted from the client.
| It comes from the authenticated user's ID.
|
*/
export const createPost = async (
  postData: CreatePostInput,
  userId: string
) => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError(
      "Invalid authenticated user ID.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  // Validate media if provided
  const mediaValidation = validatePostMedia(
    postData.mediaUrl,
    postData.mediaPublicId
  );
  if (!mediaValidation.valid) {
    throw new AppError(
      mediaValidation.error || "Invalid post media.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const cleanMediaUrl = postData.mediaUrl ? postData.mediaUrl.trim() : undefined;
  const cleanMediaPublicId = postData.mediaPublicId
    ? postData.mediaPublicId.trim()
    : undefined;

  try {
    const post = await Post.create({
      authorId: new Types.ObjectId(userId),
      content: postData.content,
      mediaUrl: cleanMediaUrl,
      mediaPublicId: cleanMediaPublicId,
      isPublished: true,
      isDeleted: false,
      likesCount: 0,
      commentsCount: 0,
    });

    return post;
  } catch (error) {
    // If DB creation fails after a new Cloudinary upload, attempt cleanup of new asset
    if (cleanMediaPublicId) {
      try {
        await cloudinaryService.deleteAsset(cleanMediaPublicId, "image");
      } catch (cleanupErr) {
        console.error(
          "Failed to cleanup new post media asset on post creation error:",
          cleanupErr
        );
      }
    }
    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| Get Post By ID
|--------------------------------------------------------------------------
|
| Only published and non-deleted posts are publicly accessible.
| Enriches post with `isLiked` if current user is authenticated.
|
*/
export const getPostById = async (
  postId: string,
  currentUserId?: string
) => {
  if (!Types.ObjectId.isValid(postId)) {
    throw new AppError(
      "Invalid post ID.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const post = await Post.findOne({
    _id: postId,
    isDeleted: false,
    isPublished: true,
  })
    .populate("authorId", "name email profilePicture role")
    .lean();

  if (!post) {
    throw new AppError(
      "Post not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  let isLiked = false;
  if (currentUserId && Types.ObjectId.isValid(currentUserId)) {
    const reaction = await PostReaction.findOne({
      postId: post._id,
      userId: new Types.ObjectId(currentUserId),
    }).lean();

    isLiked = !!reaction;
  }

  return {
    ...post,
    isLiked,
  };
};

/*
|--------------------------------------------------------------------------
| Get Posts
|--------------------------------------------------------------------------
|
| Global public feed.
|
| Returns:
| - Published posts
| - Non-deleted posts
| - Paginated results
| - Newest first by default
| - `isLiked` state resolved in a single batch query (no N+1)
|
| Uses the existing project pagination utility.
|--------------------------------------------------------------------------
*/
export const getPosts = async (
  filters: PostFilters = {},
  currentUserId?: string
) => {
  const { page, limit, skip } = getPaginationOptions({
    page: filters.page,
    limit: filters.limit,
  });

  const sortOptions: Record<string, 1 | -1> =
    filters.sort === "oldest"
      ? { createdAt: 1 }
      : { createdAt: -1 };

  const query = {
    isPublished: true,
    isDeleted: false,
  };

  const [posts, totalItems] = await Promise.all([
    Post.find(query)
      .populate("authorId", "name email profilePicture role")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),

    Post.countDocuments(query),
  ]);

  let likedPostIdSet = new Set<string>();

  if (
    currentUserId &&
    Types.ObjectId.isValid(currentUserId) &&
    posts.length > 0
  ) {
    const postIds = posts.map((p) => p._id);
    const reactions = await PostReaction.find({
      postId: { $in: postIds },
      userId: new Types.ObjectId(currentUserId),
    })
      .select("postId")
      .lean();

    likedPostIdSet = new Set(reactions.map((r) => r.postId.toString()));
  }

  const enrichedPosts = posts.map((post) => ({
    ...post,
    isLiked: likedPostIdSet.has(post._id.toString()),
  }));

  return buildPaginatedResult(
    enrichedPosts,
    totalItems,
    page,
    limit
  );
};

/*
|--------------------------------------------------------------------------
| Update Post
|--------------------------------------------------------------------------
|
| Only the owner of the post can update it.
|
| The authenticated user's ID is compared against Post.authorId.
|
*/
export const updatePost = async (
  postId: string,
  userId: string,
  updateData: UpdatePostInput
) => {
  if (!Types.ObjectId.isValid(postId)) {
    throw new AppError(
      "Invalid post ID.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError(
      "Invalid authenticated user ID.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  const post = await Post.findOne({
    _id: postId,
    isDeleted: false,
  });

  if (!post) {
    throw new AppError(
      "Post not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  if (post.authorId.toString() !== userId) {
    throw new AppError(
      "You are not allowed to update this post.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  // Validate media if being updated
  if (
    updateData.mediaUrl !== undefined ||
    updateData.mediaPublicId !== undefined
  ) {
    const mediaValidation = validatePostMedia(
      updateData.mediaUrl,
      updateData.mediaPublicId
    );
    if (!mediaValidation.valid) {
      throw new AppError(
        mediaValidation.error || "Invalid post media.",
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }

  const oldMediaPublicId = post.mediaPublicId;

  if (updateData.content !== undefined) {
    post.content = updateData.content;
  }

  if (updateData.mediaUrl !== undefined) {
    post.mediaUrl = updateData.mediaUrl ? updateData.mediaUrl.trim() : undefined;
  }

  if (updateData.mediaPublicId !== undefined) {
    post.mediaPublicId = updateData.mediaPublicId
      ? updateData.mediaPublicId.trim()
      : undefined;
  }

  try {
    await post.save();
  } catch (error) {
    // If DB update fails after a new Cloudinary upload, attempt cleanup of new asset
    if (
      updateData.mediaPublicId &&
      updateData.mediaPublicId !== oldMediaPublicId
    ) {
      try {
        await cloudinaryService.deleteAsset(
          updateData.mediaPublicId.trim(),
          "image"
        );
      } catch (cleanupErr) {
        console.error(
          "Failed to cleanup new post media asset after DB update error:",
          cleanupErr
        );
      }
    }
    throw error;
  }

  // After DB update succeeds, delete old Cloudinary asset if replaced or removed
  if (
    oldMediaPublicId &&
    oldMediaPublicId !== post.mediaPublicId
  ) {
    try {
      await cloudinaryService.deleteAsset(oldMediaPublicId, "image");
    } catch (cleanupErr) {
      console.error(
        "Failed to delete old post media asset from Cloudinary:",
        cleanupErr
      );
    }
  }

  return post;
};

/*
|--------------------------------------------------------------------------
| Delete Post
|--------------------------------------------------------------------------
|
| Posts use soft deletion.
|
| Only the owner of the post can delete it.
|
*/
export const deletePost = async (
  postId: string,
  userId: string
) => {
  if (!Types.ObjectId.isValid(postId)) {
    throw new AppError(
      "Invalid post ID.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError(
      "Invalid authenticated user ID.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  const post = await Post.findOne({
    _id: postId,
    isDeleted: false,
  });

  if (!post) {
    throw new AppError(
      "Post not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  if (post.authorId.toString() !== userId) {
    throw new AppError(
      "You are not allowed to delete this post.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  post.isDeleted = true;

  await post.save();

  return post;
};