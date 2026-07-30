import { NextFunction, Request, Response } from "express";
import { UserRole } from "../constants/roles";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";

export const authorize =
  (...allowedRoles: UserRole[]) =>
  (
    req: Request,
    _res: Response,
    next: NextFunction
  ): void => {
    /*
    |--------------------------------------------------------------------------
    | Ensure User Is Authenticated
    |--------------------------------------------------------------------------
    */

    if (!req.user) {
      throw new AppError(
        "Authentication required.",
        HTTP_STATUS.UNAUTHORIZED
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Check User Role
    |--------------------------------------------------------------------------
    */

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        "You are not authorized to perform this action.",
        HTTP_STATUS.FORBIDDEN
      );
    }

    next();
  };