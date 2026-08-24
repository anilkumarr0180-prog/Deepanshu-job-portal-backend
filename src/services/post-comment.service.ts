import mongoose, { Types } from "mongoose";
import Post from "../models/post.model";
import PostComment from "../models/post-comment.model";
import User from "../models/user.model";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import {
  getPaginationOptions,
  buildPaginatedResult,
} from "../utils/pagination";
import { createNotification } from "./notification.service";
import { NOTIFICATION_TYPES } from "../constants/notification-type";

interface CreateCommentInput {
  content: string;
  parentCommentId?: string | null;
}

interface UpdateCommentInput {
  content: string;
}

interface CommentFilters {
  page?: string | number;
  limit?: string | number;
  sort?: "newest" | "oldest";
  parentCommentId?: string | null;
}

/*
|--------------------------------------------------------------------------
| Create Comment or Reply
|--------------------------------------------------------------------------
|
| Creates a comment/reply and increments commentsCount atomically.
| Enforces strict single-level reply depth and triggers notifications.
|
*/
export const createPostComment = async (
  postId: string,
  userId: string,
  commentData: CreateCommentInput
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

  const isReply = Boolean(commentData.parentCommentId);

  if (isReply && !Types.ObjectId.isValid(commentData.parentCommentId!)) {
    throw new AppError(
      "Invalid parent comment ID.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const session = await mongoose.startSession();

  let createdComment: any = null;
  let postAuthorId: string | null = null;
  let parentCommentAuthorId: string | null = null;
  let parentCommentIdStr: string | null = null;

  try {
    session.startTransaction();

    /*
    |--------------------------------------------------------------------------
    | Verify Post
    |--------------------------------------------------------------------------
    |
    | Comments can only be added to published, non-deleted posts.
    |--------------------------------------------------------------------------
    */
    const post = await Post.findOne({
      _id: postId,
      isDeleted: false,
      isPublished: true,
    }).session(session);

    if (!post) {
      throw new AppError(
        "Post not found.",
        HTTP_STATUS.NOT_FOUND
      );
    }

    postAuthorId = post.authorId.toString();

    /*
    |--------------------------------------------------------------------------
    | Verify Parent Comment (if this is a reply)
    |--------------------------------------------------------------------------
    */
    if (isReply) {
      const parentComment = await PostComment.findOne({
        _id: commentData.parentCommentId,
        postId: new Types.ObjectId(postId),
      }).session(session);

      if (!parentComment) {
        throw new AppError(
          "Parent comment not found on this post.",
          HTTP_STATUS.NOT_FOUND
        );
      }

      if (parentComment.isDeleted) {
        throw new AppError(
          "Cannot reply to a deleted comment.",
          HTTP_STATUS.BAD_REQUEST
        );
      }

      // Strict Depth Enforcement: Only single-level replies permitted
      if (parentComment.parentCommentId) {
        throw new AppError(
          "Cannot reply to a reply. Only single-level replies are permitted.",
          HTTP_STATUS.BAD_REQUEST
        );
      }

      parentCommentAuthorId = parentComment.authorId.toString();
      parentCommentIdStr = parentComment._id.toString();
    }

    /*
    |--------------------------------------------------------------------------
    | Create Comment / Reply
    |--------------------------------------------------------------------------
    */
    const comment = new PostComment({
      postId: new Types.ObjectId(postId),
      parentCommentId: isReply ? new Types.ObjectId(commentData.parentCommentId!) : null,
      authorId: new Types.ObjectId(userId),
      content: commentData.content,
      isDeleted: false,
    });

    await comment.save({ session });

    /*
    |--------------------------------------------------------------------------
    | Increment Post Comment Counter
    |--------------------------------------------------------------------------
    */
    await Post.updateOne(
      { _id: postId },
      { $inc: { commentsCount: 1 } },
      { session }
    );

    await session.commitTransaction();
    createdComment = comment;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }

  /*
  |--------------------------------------------------------------------------
  | Dispatch Notification (Asynchronous / Resilient)
  |--------------------------------------------------------------------------
  |
  | Notification failure must never block or rollback successful comment creation.
  |--------------------------------------------------------------------------
  */
  try {
    const actor = await User.findById(userId).select("name").lean();
    const actorName = actor?.name || "A community member";

    if (isReply && parentCommentAuthorId && parentCommentAuthorId !== userId) {
      // Notify parent comment author
      await createNotification({
        recipientId: parentCommentAuthorId,
        senderId: userId,
        type: NOTIFICATION_TYPES.COMMENT_REPLIED,
        title: "New Reply to Your Comment",
        body: `${actorName} replied to your comment: "${commentData.content.slice(0, 100)}${commentData.content.length > 100 ? "..." : ""}"`,
        link: `/posts#post-${postId}`,
        metadata: {
          postId,
          commentId: createdComment._id.toString(),
          parentCommentId: parentCommentIdStr,
        },
      });
    } else if (!isReply && postAuthorId && postAuthorId !== userId) {
      // Notify post author
      await createNotification({
        recipientId: postAuthorId,
        senderId: userId,
        type: NOTIFICATION_TYPES.POST_COMMENTED,
        title: "New Comment on Your Post",
        body: `${actorName} commented on your post: "${commentData.content.slice(0, 100)}${commentData.content.length > 100 ? "..." : ""}"`,
        link: `/posts#post-${postId}`,
        metadata: {
          postId,
          commentId: createdComment._id.toString(),
        },
      });
    }
  } catch (err) {
    console.error("Failed to send notification on post comment:", err);
  }

  // Populate author information for client response
  const populatedComment = await PostComment.findById(createdComment._id)
    .populate("authorId", "name email profilePicture role")
    .lean();

  return populatedComment || createdComment;
};

/*
|--------------------------------------------------------------------------
| Get Comments & Replies
|--------------------------------------------------------------------------
|
| - Without parentCommentId: Returns paginated top-level comments with reply counts.
| - With parentCommentId: Returns paginated replies under that comment.
|--------------------------------------------------------------------------
*/
export const getPostComments = async (
  postId: string,
  filters: CommentFilters = {}
) => {
  if (!Types.ObjectId.isValid(postId)) {
    throw new AppError(
      "Invalid post ID.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Verify Post
  |--------------------------------------------------------------------------
  */
  const post = await Post.findOne({
    _id: postId,
    isDeleted: false,
    isPublished: true,
  }).select("_id");

  if (!post) {
    throw new AppError(
      "Post not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  const { page, limit, skip } = getPaginationOptions({
    page: filters.page,
    limit: filters.limit,
  });

  const isQueryingReplies = Boolean(filters.parentCommentId);

  if (isQueryingReplies) {
    if (!Types.ObjectId.isValid(filters.parentCommentId!)) {
      throw new AppError(
        "Invalid parent comment ID.",
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const sortOptions: Record<string, 1 | -1> =
      filters.sort === "newest"
        ? { createdAt: -1 }
        : { createdAt: 1 }; // Default chronological for replies conversation flow

    const query = {
      postId: new Types.ObjectId(postId),
      parentCommentId: new Types.ObjectId(filters.parentCommentId!),
      isDeleted: false,
    };

    const [replies, totalItems] = await Promise.all([
      PostComment.find(query)
        .populate("authorId", "name email profilePicture role")
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      PostComment.countDocuments(query),
    ]);

    return buildPaginatedResult(replies, totalItems, page, limit);
  }

  // Top-Level Comments Query
  const sortOptions: Record<string, 1 | -1> =
    filters.sort === "oldest"
      ? { createdAt: 1 }
      : { createdAt: -1 };

  // Find top-level comments: include active comments, plus soft-deleted comments that have active replies
  const parentIdsWithActiveReplies = await PostComment.distinct("parentCommentId", {
    postId: new Types.ObjectId(postId),
    parentCommentId: { $ne: null },
    isDeleted: false,
  });

  const query: Record<string, unknown> = {
    postId: new Types.ObjectId(postId),
    parentCommentId: null,
    $or: [
      { isDeleted: false },
      { _id: { $in: parentIdsWithActiveReplies } },
    ],
  };

  const [rawComments, totalItems] = await Promise.all([
    PostComment.find(query)
      .populate("authorId", "name email profilePicture role")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    PostComment.countDocuments(query),
  ]);

  // Compute reply counts dynamically via aggregation (Zero N+1)
  const commentIds = rawComments.map((c) => c._id);
  const replyCounts = commentIds.length > 0
    ? await PostComment.aggregate([
        {
          $match: {
            parentCommentId: { $in: commentIds },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: "$parentCommentId",
            count: { $sum: 1 },
          },
        },
      ])
    : [];

  const replyCountMap = new Map<string, number>();
  replyCounts.forEach((rc) => {
    replyCountMap.set(rc._id.toString(), rc.count);
  });

  const formattedComments = rawComments.map((doc) => {
    const isDocDeleted = Boolean(doc.isDeleted);
    return {
      ...doc,
      content: isDocDeleted ? "[Comment deleted]" : doc.content,
      replyCount: replyCountMap.get(doc._id.toString()) || 0,
    };
  });

  return buildPaginatedResult(
    formattedComments,
    totalItems,
    page,
    limit
  );
};

/*
|--------------------------------------------------------------------------
| Update Comment
|--------------------------------------------------------------------------
|
| Only the comment author can update the comment.
|--------------------------------------------------------------------------
*/
export const updatePostComment = async (
  postId: string,
  commentId: string,
  userId: string,
  updateData: UpdateCommentInput
) => {
  if (!Types.ObjectId.isValid(postId)) {
    throw new AppError(
      "Invalid post ID.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (!Types.ObjectId.isValid(commentId)) {
    throw new AppError(
      "Invalid comment ID.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError(
      "Invalid authenticated user ID.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  const comment = await PostComment.findOne({
    _id: commentId,
    postId: new Types.ObjectId(postId),
    isDeleted: false,
  });

  if (!comment) {
    throw new AppError(
      "Comment not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Ownership Check
  |--------------------------------------------------------------------------
  */
  if (comment.authorId.toString() !== userId) {
    throw new AppError(
      "You are not allowed to update this comment.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  comment.content = updateData.content;
  await comment.save();

  return comment;
};

/*
|--------------------------------------------------------------------------
| Delete Comment
|--------------------------------------------------------------------------
|
| Soft deletes the comment and decrements commentsCount atomically.
|--------------------------------------------------------------------------
*/
export const deletePostComment = async (
  postId: string,
  commentId: string,
  userId: string
) => {
  if (!Types.ObjectId.isValid(postId)) {
    throw new AppError(
      "Invalid post ID.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (!Types.ObjectId.isValid(commentId)) {
    throw new AppError(
      "Invalid comment ID.",
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (!Types.ObjectId.isValid(userId)) {
    throw new AppError(
      "Invalid authenticated user ID.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    /*
    |--------------------------------------------------------------------------
    | Find Comment
    |--------------------------------------------------------------------------
    */
    const comment = await PostComment.findOne({
      _id: commentId,
      postId: new Types.ObjectId(postId),
      isDeleted: false,
    }).session(session);

    if (!comment) {
      throw new AppError(
        "Comment not found.",
        HTTP_STATUS.NOT_FOUND
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Ownership Check
    |--------------------------------------------------------------------------
    */
    if (comment.authorId.toString() !== userId) {
      throw new AppError(
        "You are not allowed to delete this comment.",
        HTTP_STATUS.FORBIDDEN
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Soft Delete Comment
    |--------------------------------------------------------------------------
    */
    comment.isDeleted = true;
    await comment.save({ session });

    /*
    |--------------------------------------------------------------------------
    | Decrease Comment Counter
    |--------------------------------------------------------------------------
    |
    | $gt: 0 prevents commentsCount from becoming negative.
    |--------------------------------------------------------------------------
    */
    await Post.updateOne(
      {
        _id: postId,
        commentsCount: { $gt: 0 },
      },
      {
        $inc: { commentsCount: -1 },
      },
      { session }
    );

    await session.commitTransaction();

    return comment;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    await session.endSession();
  }
};