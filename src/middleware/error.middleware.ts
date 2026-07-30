import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/app-error";

export const errorMiddleware = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors ?? [],
    });

    return;
  }

  console.error(err);

  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    errors: [],
  });
};