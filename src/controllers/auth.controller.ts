import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as authService from "../services/auth.service";

/*
|--------------------------------------------------------------------------
| Register User
|--------------------------------------------------------------------------
| Controller responsibility:
| - Receive validated request
| - Call the service
| - Return HTTP response
|
| No business logic should live here.
|--------------------------------------------------------------------------
*/
export const register = async (
  req: Request,
  res: Response
): Promise<void> => {
  const user = await authService.register(req.body);

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: "User registered successfully.",
    data: user,
  });
};

/*
|--------------------------------------------------------------------------
| Login User
|--------------------------------------------------------------------------
| Controller responsibility:
| - Receive validated request
| - Call the service
| - Return HTTP response
|
| No business logic should live here.
|--------------------------------------------------------------------------
*/
export const login = async (
  req: Request,
  res: Response
): Promise<void> => {
  const result = await authService.login(req.body);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    message: "Login successful.",
    data: result,
  });
};
export const getCurrentUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const user = await authService.getCurrentUser(req.user!.userId);

  res.status(HTTP_STATUS.OK).json({
    success: true,
    data: user,
  });
};