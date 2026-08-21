import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as postReactionService from "../services/post-reaction.service";
import { asyncHandler } from "../middleware/async-handler";

/*
|--------------------------------------------------------------------------
| Create Post Reaction
|--------------------------------------------------------------------------
|
| POST /api/posts/:id/reactions
|
| The post ID comes from the route.
| The user ID comes from the authenticated user.
|--------------------------------------------------------------------------
*/
export const createPostReaction = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const postId = req.params.id as string;
    const userId = req.user!.userId;

    const reaction = await postReactionService.createPostReaction(
      postId,
      userId
    );

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Post liked successfully.",
      data: reaction,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Delete Post Reaction
|--------------------------------------------------------------------------
|
| DELETE /api/posts/:id/reactions
|
| Removes the authenticated user's like.
|--------------------------------------------------------------------------
*/
export const deletePostReaction = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const postId = req.params.id as string;
    const userId = req.user!.userId;

    await postReactionService.deletePostReaction(
      postId,
      userId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Post unliked successfully.",
    });
  }
);