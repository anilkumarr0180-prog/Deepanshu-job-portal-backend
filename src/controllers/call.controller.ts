import { Request, Response, NextFunction } from "express";
import { getIceServersConfig } from "../services/turn.service";

/**
 * Controller to fetch time-limited STUN/TURN ICE server configuration
 */
export const getIceServersController = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        message: "Authentication required to fetch ICE server configuration.",
      });
      return;
    }

    const iceConfig = getIceServersConfig(userId);

    res.status(200).json({
      success: true,
      message: "ICE server configuration retrieved successfully.",
      data: iceConfig,
    });
  } catch (error) {
    next(error);
  }
};
