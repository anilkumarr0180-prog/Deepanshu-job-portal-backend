import mongoose, { Types } from "mongoose";
import Post from "../models/post.model";
import PostReaction from "../models/post-reaction.model";
import SavedPost from "../models/saved-post.model";
import User from "../models/user.model";
import Connection from "../models/connection.model";
import cloudinaryService from "./cloudinary.service";
import { validatePostMedia } from "../validations/post.validations";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { getPaginationOptions, buildPaginatedResult } from "../utils/pagination";
import { createNotification } from "./notification.service";
import { NOTIFICATION_TYPES } from "../constants/notification-type";

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
  feedType?: "for-you" | "recent" | "my-network";
  search?: string;
}

export const createPost = async (postData: CreatePostInput, userId: string) => {
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid authenticated user ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const mediaValidation = validatePostMedia(postData.mediaUrl, postData.mediaPublicId);
  if (!mediaValidation.valid) {
    throw new AppError(mediaValidation.error || "Invalid post media.", HTTP_STATUS.BAD_REQUEST);
  }

  const cleanMediaUrl = postData.mediaUrl ? postData.mediaUrl.trim() : undefined;
  const cleanMediaPublicId = postData.mediaPublicId ? postData.mediaPublicId.trim() : undefined;

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
      repostsCount: 0,
    });

    const populated = await Post.findById(post._id)
      .populate("authorId", "name email profilePicture role")
      .lean();

    return populated || post;
  } catch (error) {
    if (cleanMediaPublicId) {
      try {
        await cloudinaryService.deleteAsset(cleanMediaPublicId, "image");
      } catch (cleanupErr) {
        console.error("Failed to cleanup new post media asset on post creation error:", cleanupErr);
      }
    }
    throw error;
  }
};

export const repostPost = async (postId: string, userId: string, commentary?: string) => {
  if (!Types.ObjectId.isValid(postId)) {
    throw new AppError("Invalid post ID.", HTTP_STATUS.BAD_REQUEST);
  }
  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid authenticated user ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const session = await mongoose.startSession();
  let createdRepostId: Types.ObjectId | null = null;
  let originalPostAuthorId: string | null = null;
  let rootPostIdToNotify: string | null = null;

  try {
    session.startTransaction();

    const targetPost = await Post.findOne({
      _id: postId,
      isDeleted: false,
      isPublished: true,
    }).session(session);

    if (!targetPost) {
      throw new AppError("Post not found or unavailable.", HTTP_STATUS.NOT_FOUND);
    }

    const rootPostId = targetPost.originalPostId ? targetPost.originalPostId : targetPost._id;

    const rootPost = await Post.findOne({
      _id: rootPostId,
      isDeleted: false,
      isPublished: true,
    }).session(session);

    if (!rootPost) {
      throw new AppError("The original post has been deleted or is unavailable.", HTTP_STATUS.BAD_REQUEST);
    }

    originalPostAuthorId = rootPost.authorId.toString();
    rootPostIdToNotify = rootPost._id.toString();

    const existingRepost = await Post.findOne({
      authorId: new Types.ObjectId(userId),
      originalPostId: rootPost._id,
      isDeleted: false,
    }).session(session);

    if (existingRepost) {
      throw new AppError("You have already reposted this post.", HTTP_STATUS.CONFLICT);
    }

    const repost = new Post({
      authorId: new Types.ObjectId(userId),
      content: commentary ? commentary.trim() : "",
      originalPostId: rootPost._id,
      isPublished: true,
      isDeleted: false,
      likesCount: 0,
      commentsCount: 0,
      repostsCount: 0,
    });

    await repost.save({ session });
    createdRepostId = repost._id as Types.ObjectId;

    await Post.updateOne(
      { _id: rootPost._id },
      { $inc: { repostsCount: 1 } },
      { session }
    );

    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }

  if (originalPostAuthorId && originalPostAuthorId !== userId && rootPostIdToNotify) {
    try {
      const actor = await User.findById(userId).select("name").lean();
      const actorName = actor?.name || "A community member";

      await createNotification({
        recipientId: originalPostAuthorId,
        senderId: userId,
        type: NOTIFICATION_TYPES.POST_REPOSTED,
        title: "Your Post was Reposted",
        body: actorName + " shared your post to their network.",
        link: "/posts#post-" + rootPostIdToNotify,
        metadata: {
          postId: rootPostIdToNotify,
          repostId: createdRepostId?.toString(),
        },
      });
    } catch (err) {
      console.error("Failed to send notification on repost:", err);
    }
  }

  const populated = await Post.findById(createdRepostId)
    .populate("authorId", "name email profilePicture role")
    .populate({
      path: "originalPostId",
      populate: {
        path: "authorId",
        select: "name email profilePicture role",
      },
    })
    .lean();

  return {
    ...populated,
    isLiked: false,
    isReposted: true,
  };
};

export const getPostById = async (postId: string, currentUserId?: string) => {
  if (!Types.ObjectId.isValid(postId)) {
    throw new AppError("Invalid post ID.", HTTP_STATUS.BAD_REQUEST);
  }

  const post: any = await Post.findOne({
    _id: postId,
    isDeleted: false,
    isPublished: true,
  })
    .populate("authorId", "name email profilePicture role")
    .populate({
      path: "originalPostId",
      populate: {
        path: "authorId",
        select: "name email profilePicture role",
      },
    })
    .lean();

  if (!post) {
    throw new AppError("Post not found.", HTTP_STATUS.NOT_FOUND);
  }

  let isLiked = false;
  let isReposted = false;
  let isSaved = false;

  if (currentUserId && Types.ObjectId.isValid(currentUserId)) {
    const userObjId = new Types.ObjectId(currentUserId);
    const [reaction, userRepost, savedRecord] = await Promise.all([
      PostReaction.findOne({ postId: post._id, userId: userObjId }).lean(),
      Post.findOne({ authorId: userObjId, originalPostId: post._id, isDeleted: false }).lean(),
      SavedPost.findOne({ postId: post._id, userId: userObjId }).lean(),
    ]);
    isLiked = !!reaction;
    isReposted = !!userRepost;
    isSaved = !!savedRecord;
  }

  return {
    ...post,
    isLiked,
    isReposted,
    isSaved,
  };
};

async function enrichAndPaginate(
  posts: any[],
  totalItems: number,
  page: number,
  limit: number,
  currentUserId?: string
) {
  let likedPostIdSet = new Set<string>();
  let repostedPostIdSet = new Set<string>();
  let savedPostIdSet = new Set<string>();

  if (currentUserId && Types.ObjectId.isValid(currentUserId) && posts.length > 0) {
    const postIds = posts.map((p) => p._id);
    const userObjId = new Types.ObjectId(currentUserId);

    const [reactions, userReposts, savedList] = await Promise.all([
      PostReaction.find({ postId: { $in: postIds }, userId: userObjId }).select("postId").lean(),
      Post.find({ authorId: userObjId, originalPostId: { $in: postIds }, isDeleted: false }).select("originalPostId").lean(),
      SavedPost.find({ postId: { $in: postIds }, userId: userObjId }).select("postId").lean(),
    ]);

    likedPostIdSet = new Set(reactions.map((r) => r.postId.toString()));
    repostedPostIdSet = new Set(userReposts.map((r) => r.originalPostId!.toString()));
    savedPostIdSet = new Set(savedList.map((s) => s.postId.toString()));
  }

  const enrichedPosts = posts.map((post) => ({
    ...post,
    isLiked: likedPostIdSet.has(post._id.toString()),
    isReposted: repostedPostIdSet.has(post._id.toString()),
    isSaved: savedPostIdSet.has(post._id.toString()),
  }));

  return buildPaginatedResult(enrichedPosts, totalItems, page, limit);
}

export const getPosts = async (filters: PostFilters = {}, currentUserId?: string) => {
  const { page, limit, skip } = getPaginationOptions({ page: filters.page, limit: filters.limit });
  const query: Record<string, unknown> = { isPublished: true, isDeleted: false };

  if (filters.search) {
    query.content = { $regex: filters.search, $options: "i" };
  }

  // Case 1: My Network Feed
  if (filters.feedType === "my-network") {
    // Unauthenticated guest has no network
    if (!currentUserId || !Types.ObjectId.isValid(currentUserId)) {
      return buildPaginatedResult([], 0, page, limit);
    }

    const userObjId = new Types.ObjectId(currentUserId);
    const connections = await Connection.find({
      $or: [
        { requesterId: userObjId, status: "accepted" },
        { recipientId: userObjId, status: "accepted" },
      ],
    }).select("requesterId recipientId").lean();

    const connectedUserIds = connections.map((c) =>
      c.requesterId.toString() === currentUserId ? c.recipientId : c.requesterId
    );
    connectedUserIds.push(userObjId);
    query.authorId = { $in: connectedUserIds };

    const sortOptions: Record<string, 1 | -1> = filters.sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

    const [posts, totalItems] = await Promise.all([
      Post.find(query)
        .populate("authorId", "name email profilePicture role")
        .populate({
          path: "originalPostId",
          populate: {
            path: "authorId",
            select: "name email profilePicture role",
          },
        })
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      Post.countDocuments(query),
    ]);

    return enrichAndPaginate(posts, totalItems, page, limit, currentUserId);
  }

  // Case 2: For You Feed (Default or explicit 'for-you' when no custom oldest sort)
  if (filters.feedType === "for-you" && filters.sort !== "oldest") {
    let connectedObjectIds: Types.ObjectId[] = [];
    let userObjId: Types.ObjectId | null = null;

    if (currentUserId && Types.ObjectId.isValid(currentUserId)) {
      userObjId = new Types.ObjectId(currentUserId);
      const connections = await Connection.find({
        $or: [
          { requesterId: userObjId, status: "accepted" },
          { recipientId: userObjId, status: "accepted" },
        ],
      }).select("requesterId recipientId").lean();

      connectedObjectIds = connections.map((c) =>
        c.requesterId.toString() === currentUserId ? (c.recipientId as Types.ObjectId) : (c.requesterId as Types.ObjectId)
      );
    }

    const now = new Date();

    // Aggregation pipeline to deterministically calculate score, sort, and paginate
    const pipeline: mongoose.PipelineStage[] = [
      { $match: query },
      {
        $addFields: {
          ageInHours: {
            $divide: [
              { $max: [0, { $subtract: [now, "$createdAt"] }] },
              1000 * 60 * 60,
            ],
          },
          isConnection: connectedObjectIds.length > 0
            ? { $in: ["$authorId", connectedObjectIds] }
            : false,
          isSelf: userObjId
            ? { $eq: ["$authorId", userObjId] }
            : false,
        },
      },
      {
        $addFields: {
          recencyScore: {
            $max: [
              0,
              { $subtract: [100, { $multiply: ["$ageInHours", 1.5] }] },
            ],
          },
          engagementScore: {
            $add: [
              { $multiply: [{ $ifNull: ["$likesCount", 0] }, 3] },
              { $multiply: [{ $ifNull: ["$commentsCount", 0] }, 5] },
              { $multiply: [{ $ifNull: ["$repostsCount", 0] }, 6] },
            ],
          },
          affinityScore: {
            $add: [
              { $cond: ["$isConnection", 30, 0] },
              { $cond: ["$isSelf", 15, 0] },
            ],
          },
        },
      },
      {
        $addFields: {
          score: {
            $add: ["$recencyScore", "$engagementScore", "$affinityScore"],
          },
        },
      },
      { $sort: { score: -1, createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: { _id: 1 } },
    ];

    const [rankedIdsResult, totalItems] = await Promise.all([
      Post.aggregate(pipeline),
      Post.countDocuments(query),
    ]);

    const rankedIds = rankedIdsResult.map((doc) => doc._id);

    if (rankedIds.length === 0) {
      return buildPaginatedResult([], totalItems, page, limit);
    }

    const posts = await Post.find({ _id: { $in: rankedIds } })
      .populate("authorId", "name email profilePicture role")
      .populate({
        path: "originalPostId",
        populate: {
          path: "authorId",
          select: "name email profilePicture role",
        },
      })
      .lean();

    // Preserve the exact ranking order from aggregation
    const postMap = new Map<string, any>(posts.map((p) => [p._id.toString(), p]));
    const orderedPosts = rankedIds
      .map((id) => postMap.get(id.toString()))
      .filter(Boolean);

    return enrichAndPaginate(orderedPosts, totalItems, page, limit, currentUserId);
  }

  // Case 3: Recent Feed (or fallback explicit sort)
  const sortOptions: Record<string, 1 | -1> = filters.sort === "oldest" ? { createdAt: 1 } : { createdAt: -1 };

  const [posts, totalItems] = await Promise.all([
    Post.find(query)
      .populate("authorId", "name email profilePicture role")
      .populate({
        path: "originalPostId",
        populate: {
          path: "authorId",
          select: "name email profilePicture role",
        },
      })
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    Post.countDocuments(query),
  ]);

  return enrichAndPaginate(posts, totalItems, page, limit, currentUserId);
};

export const updatePost = async (postId: string, userId: string, updateData: UpdatePostInput) => {
  if (!Types.ObjectId.isValid(postId)) throw new AppError("Invalid post ID.", HTTP_STATUS.BAD_REQUEST);
  if (!Types.ObjectId.isValid(userId)) throw new AppError("Invalid authenticated user ID.", HTTP_STATUS.UNAUTHORIZED);

  const post = await Post.findOne({ _id: postId, isDeleted: false });
  if (!post) throw new AppError("Post not found.", HTTP_STATUS.NOT_FOUND);
  if (post.authorId.toString() !== userId) throw new AppError("You are not allowed to update this post.", HTTP_STATUS.FORBIDDEN);

  if (updateData.mediaUrl !== undefined || updateData.mediaPublicId !== undefined) {
    const mediaValidation = validatePostMedia(updateData.mediaUrl, updateData.mediaPublicId);
    if (!mediaValidation.valid) throw new AppError(mediaValidation.error || "Invalid post media.", HTTP_STATUS.BAD_REQUEST);
  }

  const oldMediaPublicId = post.mediaPublicId;
  if (updateData.content !== undefined) post.content = updateData.content;
  if (updateData.mediaUrl !== undefined) post.mediaUrl = updateData.mediaUrl ? updateData.mediaUrl.trim() : undefined;
  if (updateData.mediaPublicId !== undefined) post.mediaPublicId = updateData.mediaPublicId ? updateData.mediaPublicId.trim() : undefined;

  try {
    await post.save();
  } catch (error) {
    if (updateData.mediaPublicId && updateData.mediaPublicId !== oldMediaPublicId) {
      try {
        await cloudinaryService.deleteAsset(updateData.mediaPublicId.trim(), "image");
      } catch (cleanupErr) {
        console.error("Failed to cleanup new post media asset after DB update error:", cleanupErr);
      }
    }
    throw error;
  }

  if (oldMediaPublicId && oldMediaPublicId !== post.mediaPublicId) {
    try {
      await cloudinaryService.deleteAsset(oldMediaPublicId, "image");
    } catch (cleanupErr) {
      console.error("Failed to delete old post media asset from Cloudinary:", cleanupErr);
    }
  }

  const populated = await Post.findById(post._id)
    .populate("authorId", "name email profilePicture role")
    .populate({
      path: "originalPostId",
      populate: { path: "authorId", select: "name email profilePicture role" },
    })
    .lean();

  return populated || post;
};

export const deletePost = async (postId: string, userId: string) => {
  if (!Types.ObjectId.isValid(postId)) throw new AppError("Invalid post ID.", HTTP_STATUS.BAD_REQUEST);
  if (!Types.ObjectId.isValid(userId)) throw new AppError("Invalid authenticated user ID.", HTTP_STATUS.UNAUTHORIZED);

  const post = await Post.findOne({ _id: postId, isDeleted: false });
  if (!post) throw new AppError("Post not found.", HTTP_STATUS.NOT_FOUND);
  if (post.authorId.toString() !== userId) throw new AppError("You are not allowed to delete this post.", HTTP_STATUS.FORBIDDEN);

  post.isDeleted = true;
  await post.save();

  if (post.originalPostId) {
    try {
      await Post.updateOne(
        { _id: post.originalPostId, repostsCount: { $gt: 0 } },
        { $inc: { repostsCount: -1 } }
      );
    } catch (err) {
      console.error("Failed to decrement repost count on deletion:", err);
    }
  }

  return post;
};