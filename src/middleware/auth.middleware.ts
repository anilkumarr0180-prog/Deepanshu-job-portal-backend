import { Request, Response, NextFunction } from "express";
import { JsonWebTokenError, TokenExpiredError, NotBeforeError } from "jsonwebtoken";
import { verifyAccessToken } from "../utils/jwt";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { UserRole } from "../constants/roles";

export interface AuthRequest extends Request {
  user?: {
    userId: string;
    id?: string;
    role: UserRole;
  };
}

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
  | Validate Bearer Scheme and Extract Token
  |--------------------------------------------------------------------------
  */

  if (!authHeader.startsWith("Bearer ")) {
    throw new AppError(
      "Invalid authorization header format. Format must be 'Bearer <token>'.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  const token = authHeader.split(" ")[1];

  if (!token || token.trim() === "") {
    throw new AppError(
      "Authentication token missing.",
      HTTP_STATUS.UNAUTHORIZED
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Verify JWT securely
  |--------------------------------------------------------------------------
  */

  try {
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
  } catch (error) {
    if (
      error instanceof JsonWebTokenError ||
      error instanceof TokenExpiredError ||
      error instanceof NotBeforeError
    ) {
      throw new AppError(
        "Invalid or expired authentication token.",
        HTTP_STATUS.UNAUTHORIZED
      );
    }
    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| Optional Authentication Middleware
|--------------------------------------------------------------------------
|
| Extracts and verifies token if present, but does not block if absent or invalid.
| Attaches req.user when valid token is provided.
|--------------------------------------------------------------------------
*/
export const optionalAuthMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return next();
  }

  const token = authHeader.split(" ")[1];

  if (!token || token.trim() === "") {
    return next();
  }

  try {
    const decodedUser = verifyAccessToken(token);

    req.user = {
      userId: decodedUser.userId,
      role: decodedUser.role,
    };
  } catch (_error) {
    // Silently continue for unauthenticated / invalid token in optional auth
  }

  next();
};