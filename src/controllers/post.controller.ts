import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as postService from "../services/post.service";
import * as postReactionService from "../services/post-reaction.service";
import { asyncHandler } from "../middleware/async-handler";

export const createPost = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user!.userId;
    const post = await postService.createPost(req.body, userId);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Post created successfully.",
      data: post,
    });
  }
);

export const repostPost = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const userId = req.user!.userId;
    const commentary = req.body?.content;

    const post = await postService.repostPost(id, userId, commentary);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Post reposted successfully.",
      data: post,
    });
  }
);

export const getPosts = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const currentUserId = req.user?.userId;
    const posts = await postService.getPosts(req.query, currentUserId);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Posts fetched successfully.",
      data: posts,
    });
  }
);

export const getPostById = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const currentUserId = req.user?.userId;
    const post = await postService.getPostById(id, currentUserId);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Post fetched successfully.",
      data: post,
    });
  }
);

export const updatePost = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const userId = req.user!.userId;
    const post = await postService.updatePost(id, userId, req.body);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Post updated successfully.",
      data: post,
    });
  }
);

export const deletePost = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const userId = req.user!.userId;
    await postService.deletePost(id, userId);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Post deleted successfully.",
    });
  }
);

export const createPostReaction = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const postId = req.params.id as string;
    const userId = req.user!.userId;
    const reaction = await postReactionService.createPostReaction(postId, userId);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Post liked successfully.",
      data: reaction,
    });
  }
);

export const deletePostReaction = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const postId = req.params.id as string;
    const userId = req.user!.userId;
    await postReactionService.deletePostReaction(postId, userId);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Post unliked successfully.",
    });
  }
);
