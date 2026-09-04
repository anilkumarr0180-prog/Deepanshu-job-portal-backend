import { Request, Response, NextFunction } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as contactService from "../services/contact.service";

/**
 * Controller to handle POST /api/contact submissions.
 */
export const submitContactForm = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const clientIp =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip;

    const result = await contactService.processContactMessage(req.body, {
      clientIp,
    });

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};
