import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as postCommentService from "../services/post-comment.service";
import { asyncHandler } from "../middleware/async-handler";

/*
|--------------------------------------------------------------------------
| Create Comment
|--------------------------------------------------------------------------
|
| POST /api/posts/:id/comments
|
| The post ID comes from the URL.
| The user ID comes from the authenticated user.
|--------------------------------------------------------------------------
*/
export const createPostComment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const postId = req.params.id as string;
    const userId = req.user!.userId;

    const comment = await postCommentService.createPostComment(
      postId,
      userId,
      req.body
    );

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Comment created successfully.",
      data: comment,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get Comments
|--------------------------------------------------------------------------
|
| GET /api/posts/:id/comments
|
| Returns paginated, non-deleted comments for a post.
|--------------------------------------------------------------------------
*/
export const getPostComments = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const postId = req.params.id as string;

    const comments = await postCommentService.getPostComments(
      postId,
      req.query
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Comments fetched successfully.",
      data: comments,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Update Comment
|--------------------------------------------------------------------------
|
| PUT /api/posts/:postId/comments/:commentId
|
| Only the comment owner can update it.
|--------------------------------------------------------------------------
*/
export const updatePostComment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const postId = req.params.postId as string;
    const commentId = req.params.commentId as string;
    const userId = req.user!.userId;

    const comment = await postCommentService.updatePostComment(
      postId,
      commentId,
      userId,
      req.body
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Comment updated successfully.",
      data: comment,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Delete Comment
|--------------------------------------------------------------------------
|
| DELETE /api/posts/:postId/comments/:commentId
|
| Uses soft deletion.
| Only the comment owner can delete it.
|--------------------------------------------------------------------------
*/
export const deletePostComment = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const postId = req.params.postId as string;
    const commentId = req.params.commentId as string;
    const userId = req.user!.userId;

    await postCommentService.deletePostComment(
      postId,
      commentId,
      userId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Comment deleted successfully.",
    });
  }
);