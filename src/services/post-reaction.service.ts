import mongoose, { Types } from "mongoose";
import Post from "../models/post.model";
import PostReaction from "../models/post-reaction.model";
import User from "../models/user.model";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { createNotification } from "./notification.service";
import { NOTIFICATION_TYPES } from "../constants/notification-type";

/*
|--------------------------------------------------------------------------
| Create Post Reaction
|--------------------------------------------------------------------------
|
| Creates the user's like and increments likesCount atomically.
| Triggers real-time notification to the post author.
|
*/
export const createPostReaction = async (
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

  const session = await mongoose.startSession();
  let postAuthorId: string | null = null;

  try {
    session.startTransaction();

    /*
    |--------------------------------------------------------------------------
    | Verify Post
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
    | Prevent Duplicate Like
    |--------------------------------------------------------------------------
    */
    const existingReaction = await PostReaction.findOne({
      postId: new Types.ObjectId(postId),
      userId: new Types.ObjectId(userId),
    }).session(session);

    if (existingReaction) {
      throw new AppError(
        "You have already liked this post.",
        HTTP_STATUS.CONFLICT
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Create Reaction
    |--------------------------------------------------------------------------
    */
    const reaction = new PostReaction({
      postId: new Types.ObjectId(postId),
      userId: new Types.ObjectId(userId),
      type: "like",
    });

    await reaction.save({ session });

    /*
    |--------------------------------------------------------------------------
    | Increment Like Counter
    |--------------------------------------------------------------------------
    */
    await Post.updateOne(
      { _id: postId },
      { $inc: { likesCount: 1 } },
      { session }
    );

    await session.commitTransaction();

    /*
    |--------------------------------------------------------------------------
    | Dispatch Notification (Resilient & Non-blocking)
    |--------------------------------------------------------------------------
    */
    if (postAuthorId && postAuthorId !== userId) {
      try {
        const actor = await User.findById(userId).select("name").lean();
        const actorName = actor?.name || "A community member";

        await createNotification({
          recipientId: postAuthorId,
          senderId: userId,
          type: NOTIFICATION_TYPES.POST_LIKED,
          title: "New Like on Your Post",
          body: `${actorName} liked your post.`,
          link: `/posts#post-${postId}`,
          metadata: {
            postId,
          },
        });
      } catch (err) {
        console.error("Failed to send notification on post like:", err);
      }
    }

    return reaction;
  } catch (error) {
    await session.abortTransaction();

    /*
    |--------------------------------------------------------------------------
    | MongoDB Duplicate Key Protection
    |--------------------------------------------------------------------------
    |
    | The unique index on:
    | { postId: 1, userId: 1 }
    |
    | remains the final database-level protection against duplicate likes.
    |--------------------------------------------------------------------------
    */
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: number }).code === 11000
    ) {
      throw new AppError(
        "You have already liked this post.",
        HTTP_STATUS.CONFLICT
      );
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

/*
|--------------------------------------------------------------------------
| Delete Post Reaction
|--------------------------------------------------------------------------
|
| Removes the user's like and decrements likesCount atomically.
|
*/
export const deletePostReaction = async (
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

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    /*
    |--------------------------------------------------------------------------
    | Find User's Reaction
    |--------------------------------------------------------------------------
    */
    const reaction = await PostReaction.findOne({
      postId: new Types.ObjectId(postId),
      userId: new Types.ObjectId(userId),
    }).session(session);

    if (!reaction) {
      throw new AppError(
        "You have not liked this post.",
        HTTP_STATUS.NOT_FOUND
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Delete Reaction
    |--------------------------------------------------------------------------
    */
    await PostReaction.deleteOne(
      { _id: reaction._id },
      { session }
    );

    /*
    |--------------------------------------------------------------------------
    | Decrease Like Counter
    |--------------------------------------------------------------------------
    |
    | $gt: 0 prevents likesCount from becoming negative.
    |--------------------------------------------------------------------------
    */
    await Post.updateOne(
      {
        _id: postId,
        likesCount: { $gt: 0 },
      },
      {
        $inc: { likesCount: -1 },
      },
      { session }
    );

    await session.commitTransaction();

    return {
      postId,
      userId,
      type: reaction.type,
    };
  } catch (error) {
    await session.abortTransaction();

    throw error;
  } finally {
    await session.endSession();
  }
};