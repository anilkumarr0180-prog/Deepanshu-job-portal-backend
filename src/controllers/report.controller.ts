import { Request, Response, NextFunction } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as reportService from "../services/report.service";

export const submitReport = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const reporterId = req.user!.userId;
    const { targetType, targetId, reason, description } = req.body;

    const result = await reportService.createReport(reporterId, {
      targetType,
      targetId,
      reason,
      description,
    });

    res.status(result.isDuplicate ? HTTP_STATUS.OK : HTTP_STATUS.CREATED).json({
      success: true,
      message: result.message,
      data: result.report,
    });
  } catch (error) {
    next(error);
  }
};
