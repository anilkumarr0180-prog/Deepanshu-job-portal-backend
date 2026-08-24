
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

  // Handle Mongoose ValidationError
  if (err.name === "ValidationError") {
    const mongooseErr = err as any;
    const errors = Object.values(mongooseErr.errors || {}).map((e: any) => ({
      field: e.path,
      message: e.message,
    }));
    res.status(400).json({
      success: false,
      message: err.message || "Validation failed.",
      errors,
    });
    return;
  }

  // Handle Mongoose CastError
  if (err.name === "CastError") {
    const castErr = err as any;
    res.status(400).json({
      success: false,
      message: `Invalid value for field ${castErr.path}: ${castErr.value}`,
      errors: [{ field: castErr.path, message: `Invalid ${castErr.path}` }],
    });
    return;
  }

  // Handle Mongo Duplicate Key Error
  if ((err as any).code === 11000) {
    res.status(409).json({
      success: false,
      message: "Duplicate key error.",
      errors: [],
    });
    return;
  }

  console.error("[Unhandled Server Error]:", err);

  const isProduction = process.env.NODE_ENV === "production";
  const clientMessage = isProduction ? "Internal Server Error" : (err.message || "Internal Server Error");

  res.status(500).json({
    success: false,
    message: clientMessage,
    errors: [],
  });
};
