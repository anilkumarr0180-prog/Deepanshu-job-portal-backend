import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as interviewService from "../services/interview.service";
import { asyncHandler } from "../middleware/async-handler";

/*
|--------------------------------------------------------------------------
| Create / Schedule Interview Controller
|--------------------------------------------------------------------------
*/
export const createInterviewController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const actorUserId = req.user!.userId;
    const actorRole = req.user!.role;
    const applicationId = (req.body.applicationId || req.params.applicationId) as string;

    const interview = await interviewService.createInterview(
      {
        ...req.body,
        applicationId,
      },
      actorUserId,
      actorRole
    );

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Interview scheduled successfully.",
      data: interview,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get Interview By ID Controller
|--------------------------------------------------------------------------
*/
export const getInterviewByIdController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const interviewId = (req.params.interviewId || req.params.id) as string;
    const actorUserId = req.user!.userId;
    const actorRole = req.user!.role;

    const interview = await interviewService.getInterviewById(
      interviewId,
      actorUserId,
      actorRole
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: interview,
    });
  }
);

/*
|--------------------------------------------------------------------------
| List Interviews Controller (Filtered & Paginated)
|--------------------------------------------------------------------------
*/
export const listInterviewsController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const actorUserId = req.user!.userId;
    const actorRole = req.user!.role;

    const result = await interviewService.listInterviews(
      req.query,
      actorUserId,
      actorRole
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get Multi-Round Interviews for Application Controller
|--------------------------------------------------------------------------
*/
export const getApplicationInterviewsController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const applicationId = req.params.applicationId as string;
    const actorUserId = req.user!.userId;
    const actorRole = req.user!.role;

    const interviews = await interviewService.getInterviewsForApplication(
      applicationId,
      actorUserId,
      actorRole
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: interviews,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Reschedule Interview Controller
|--------------------------------------------------------------------------
*/
export const rescheduleInterviewController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const interviewId = (req.params.interviewId || req.params.id) as string;
    const actorUserId = req.user!.userId;
    const actorRole = req.user!.role;

    const interview = await interviewService.rescheduleInterview(
      interviewId,
      req.body,
      actorUserId,
      actorRole
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Interview rescheduled successfully.",
      data: interview,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Candidate RSVP Controller (Accept / Decline / Request Reschedule)
|--------------------------------------------------------------------------
*/
export const candidateRsvpController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const interviewId = (req.params.interviewId || req.params.id) as string;
    const actorUserId = req.user!.userId;

    let action = req.body.action;
    // Map convenience route suffixes if action is not in body
    if (!action) {
      if (req.path.endsWith("/accept")) action = "accept";
      else if (req.path.endsWith("/decline")) action = "decline";
      else if (req.path.endsWith("/request-reschedule")) action = "request_reschedule";
    }

    const interview = await interviewService.candidateRsvp(
      interviewId,
      {
        action,
        note: req.body.note,
        suggestedTime: req.body.suggestedTime,
      },
      actorUserId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Interview invitation ${action === "accept" ? "accepted" : action === "decline" ? "declined" : "reschedule requested"} successfully.`,
      data: interview,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Cancel Interview Controller
|--------------------------------------------------------------------------
*/
export const cancelInterviewController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const interviewId = (req.params.interviewId || req.params.id) as string;
    const actorUserId = req.user!.userId;
    const actorRole = req.user!.role;

    const interview = await interviewService.cancelInterview(
      interviewId,
      req.body?.reason,
      actorUserId,
      actorRole
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Interview cancelled successfully.",
      data: interview,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Complete Interview Controller
|--------------------------------------------------------------------------
*/
export const completeInterviewController = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const interviewId = (req.params.interviewId || req.params.id) as string;
    const actorUserId = req.user!.userId;
    const actorRole = req.user!.role;

    const interview = await interviewService.completeInterview(
      interviewId,
      req.body,
      actorUserId,
      actorRole
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Interview marked as completed successfully.",
      data: interview,
    });
  }
);
