import { Request, Response, NextFunction } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as savedPostService from "../services/saved-post.service";

export const savePost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const postId = req.params.postId as string;
    const userId = req.user!.userId;
    const result = await savedPostService.savePost(postId, userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const removeSavedPost = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const postId = req.params.postId as string;
    const userId = req.user!.userId;
    const result = await savedPostService.unsavePost(postId, userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const checkSavedStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const postId = req.params.postId as string;
    const userId = req.user!.userId;
    const result = await savedPostService.checkSavedStatus(postId, userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getMySavedPosts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const result = await savedPostService.getMySavedPosts(userId, req.query as any);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};
