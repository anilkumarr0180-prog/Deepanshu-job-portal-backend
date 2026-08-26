import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as authService from "../services/auth.service";
import { asyncHandler } from "../middleware/async-handler";

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
export const register = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await authService.register(req.body);

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "User registered successfully.",
      data: user,
    });
  }
);

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
export const login = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await authService.login(req.body);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Login successful.",
      data: result,
    });
  }
);

export const googleAuth = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await authService.googleAuth(req.body);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Google authentication successful.",
      data: result,
    });
  }
);

export const getCurrentUser = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const user = await authService.getCurrentUser(req.user!.userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: user,
    });
  }
);

export const changePassword = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await authService.changePassword(req.user!.userId, req.body);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
    });
  }
);


export const forgotPassword = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await authService.forgotPassword(req.body);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
    });
  }
);

export const resetPassword = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const token = req.params.token as string;
    const { password } = req.body;

    const result = await authService.resetPassword(token, password);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
    });
  }
);
