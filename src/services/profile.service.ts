import User from "../models/user.model";

import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";

import { sanitizeUser } from "../utils/sanitize-user";

interface UpdateProfileInput {
  name?: string;
  phone?: string;
  profilePicture?: string;
  resumeUrl?: string;
}

export const updateProfile = async (
  userId: string,
  profileData: UpdateProfileInput
) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(
      "User not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  Object.assign(user, profileData);

  await user.save();

  return sanitizeUser(user);
};

export const getProfile = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError(
      "User not found.",
      HTTP_STATUS.NOT_FOUND
    );
  }

  return sanitizeUser(user);
};