import { Request, Response } from "express";

import { HTTP_STATUS } from "../constants/http-status";

import * as profileService from "../services/profile.service";
import { asyncHandler } from "../middleware/async-handler";

export const updateProfile = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await profileService.updateProfile(req.user!.userId, req.body);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Profile updated successfully.",
      data: user,
    });
  }
);

export const getProfile = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await profileService.getProfile(req.user!.userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: user,
    });
  }
);
