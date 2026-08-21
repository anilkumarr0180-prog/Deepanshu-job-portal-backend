import mongoose, { Types } from "mongoose";
import Post from "../models/post.model";
import PostComment from "../models/post-comment.model";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import {
  getPaginationOptions,
  buildPaginatedResult,
} from "../utils/pagination";

interface CreateCommentInput {
  content: string;
}

interface UpdateCommentInput {
  content: string;
}

interface CommentFilters {
  page?: string | number;
  limit?: string | number;
  sort?: "newest" | "oldest";
}

/*
|--------------------------------------------------------------------------
| Create Comment
|--------------------------------------------------------------------------
|
| Creates a comment and increments commentsCount atomically.
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

  const session = await mongoose.startSession();

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

    /*
    |--------------------------------------------------------------------------
    | Create Comment
    |--------------------------------------------------------------------------
    */
    const comment = new PostComment({
      postId: new Types.ObjectId(postId),
      authorId: new Types.ObjectId(userId),
      content: commentData.content,
      isDeleted: false,
    });

    await comment.save({ session });

    /*
    |--------------------------------------------------------------------------
    | Increment Comment Counter
    |--------------------------------------------------------------------------
    */
    await Post.updateOne(
      { _id: postId },
      { $inc: { commentsCount: 1 } },
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

/*
|--------------------------------------------------------------------------
| Get Comments
|--------------------------------------------------------------------------
|
| Returns non-deleted comments for a published post.
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

  const sortOptions: Record<string, 1 | -1> =
    filters.sort === "oldest"
      ? { createdAt: 1 }
      : { createdAt: -1 };

  const query = {
    postId: new Types.ObjectId(postId),
    isDeleted: false,
  };

  const [comments, totalItems] = await Promise.all([
    PostComment.find(query)
      .populate(
        "authorId",
        "name email profilePicture role"
      )
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),

    PostComment.countDocuments(query),
  ]);

  return buildPaginatedResult(
    comments,
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