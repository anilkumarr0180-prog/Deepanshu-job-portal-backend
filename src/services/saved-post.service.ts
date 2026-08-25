import { Types } from "mongoose";
import SavedPost from "../models/saved-post.model";
import Post from "../models/post.model";
import PostReaction from "../models/post-reaction.model";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { getPaginationOptions, buildPaginatedResult } from "../utils/pagination";

export const savePost = async (postId: string, userId: string) => {
  if (!Types.ObjectId.isValid(postId)) {
    throw new AppError("Invalid post ID.", HTTP_STATUS.BAD_REQUEST);
  }
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid user ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const post = await Post.findOne({ _id: postId, isDeleted: false, isPublished: true });
  if (!post) {
    throw new AppError("Post not found or has been removed.", HTTP_STATUS.NOT_FOUND);
  }

  const userObjId = new Types.ObjectId(userId);
  const postObjId = new Types.ObjectId(postId);

  const existingSave = await SavedPost.findOne({ userId: userObjId, postId: postObjId });
  if (existingSave) {
    return { isSaved: true, savedPost: existingSave, message: "Post already saved." };
  }

  const savedPost = await SavedPost.create({
    userId: userObjId,
    postId: postObjId,
  });

  return { isSaved: true, savedPost, message: "Post saved successfully." };
};

export const unsavePost = async (postId: string, userId: string) => {
  if (!Types.ObjectId.isValid(postId)) {
    throw new AppError("Invalid post ID.", HTTP_STATUS.BAD_REQUEST);
  }
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid user ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const userObjId = new Types.ObjectId(userId);
  const postObjId = new Types.ObjectId(postId);

  const result = await SavedPost.findOneAndDelete({ userId: userObjId, postId: postObjId });
  if (!result) {
    return { isSaved: false, message: "Post was not saved." };
  }

  return { isSaved: false, message: "Post removed from saved list." };
};

export const checkSavedStatus = async (postId: string, userId: string) => {
  if (!Types.ObjectId.isValid(postId) || !Types.ObjectId.isValid(userId)) {
    return { isSaved: false };
  }

  const existing = await SavedPost.exists({
    userId: new Types.ObjectId(userId),
    postId: new Types.ObjectId(postId),
  });

  return { isSaved: !!existing };
};

export const getMySavedPosts = async (
  userId: string,
  queryOptions: { page?: string | number; limit?: string | number; sort?: "newest" | "oldest" } = {}
) => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid user ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const userObjId = new Types.ObjectId(userId);
  const { page, limit, skip } = getPaginationOptions({
    page: queryOptions.page,
    limit: queryOptions.limit,
  });

  const sortOrder: Record<string, 1 | -1> = queryOptions.sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

  const [savedRecords, totalItems] = await Promise.all([
    SavedPost.find({ userId: userObjId })
      .sort(sortOrder)
      .skip(skip)
      .limit(limit)
      .populate({
        path: "postId",
        match: { isDeleted: false, isPublished: true },
        populate: [
          { path: "authorId", select: "name email profilePicture role" },
          {
            path: "originalPostId",
            populate: { path: "authorId", select: "name email profilePicture role" },
          },
        ],
      })
      .lean(),
    SavedPost.countDocuments({ userId: userObjId }),
  ]);

  // Extract populated posts, ignoring any where post was soft-deleted
  const validSavedRecords = savedRecords.filter((record) => record.postId && typeof record.postId === "object");
  const postIds = validSavedRecords.map((r) => (r.postId as any)._id);

  let likedPostIdSet = new Set<string>();
  let repostedPostIdSet = new Set<string>();

  if (postIds.length > 0) {
    const [reactions, userReposts] = await Promise.all([
      PostReaction.find({ postId: { $in: postIds }, userId: userObjId }).select("postId").lean(),
      Post.find({ authorId: userObjId, originalPostId: { $in: postIds }, isDeleted: false })
        .select("originalPostId")
        .lean(),
    ]);

    likedPostIdSet = new Set(reactions.map((r) => r.postId.toString()));
    repostedPostIdSet = new Set(userReposts.map((r) => r.originalPostId!.toString()));
  }

  const posts = validSavedRecords.map((record: any) => {
    const p = record.postId;
    return {
      ...p,
      savedAt: record.createdAt,
      isSaved: true,
      isLiked: likedPostIdSet.has(p._id.toString()),
      isReposted: repostedPostIdSet.has(p._id.toString()),
    };
  });

  return buildPaginatedResult(posts, totalItems, page, limit);
};
