import { Request, Response } from "express";

import { HTTP_STATUS } from "../constants/http-status";
import { AppError } from "../utils/app-error";
import * as profileService from "../services/profile.service";
import { asyncHandler } from "../middleware/async-handler";

export const updateProfile = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    if (!userId) {
      throw new AppError("Unauthorized.", HTTP_STATUS.UNAUTHORIZED);
    }

    const user = await profileService.updateProfile(userId, req.body);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Profile updated successfully.",
      data: user,
    });
  }
);

export const getProfile = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const paramUserId = Array.isArray(req.params.userId)
      ? req.params.userId[0]
      : req.params.userId;
    const targetUserId = paramUserId || req.user?.userId;

    if (!targetUserId) {
      throw new AppError("User ID is required.", HTTP_STATUS.BAD_REQUEST);
    }

    const user = await profileService.getProfile(targetUserId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: user,
    });
  }
);

