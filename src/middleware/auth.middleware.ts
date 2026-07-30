import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../utils/jwt";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";

export const authMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  /*
  |--------------------------------------------------------------------------
  | Check Authorization Header
  |--------------------------------------------------------------------------
  */

  if (!authHeader) {
    throw new AppError(
      "Authentication required.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Extract Bearer Token
  |--------------------------------------------------------------------------
  */

  const token = authHeader.split(" ")[1];

  if (!token) {
    throw new AppError(
      "Invalid authentication token.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Verify JWT
  |--------------------------------------------------------------------------
  */

  const decodedUser = verifyAccessToken(token);

  /*
  |--------------------------------------------------------------------------
  | Attach User To Request
  |--------------------------------------------------------------------------
  */

  req.user = {
    userId: decodedUser.userId,
    role: decodedUser.role,
  };

  next();
};