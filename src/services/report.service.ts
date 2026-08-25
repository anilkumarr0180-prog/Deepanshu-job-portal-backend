import { Types } from "mongoose";
import Report, { ReportReason, ReportTargetType } from "../models/report.model";
import Post from "../models/post.model";
import PostComment from "../models/post-comment.model";
import User from "../models/user.model";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";

interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  description?: string;
}

export const createReport = async (reporterId: string, input: CreateReportInput) => {
  if (!Types.ObjectId.isValid(reporterId)) {
    throw new AppError("Invalid authenticated reporter ID.", HTTP_STATUS.UNAUTHORIZED);
  }
  if (!Types.ObjectId.isValid(input.targetId)) {
    throw new AppError("Invalid target entity ID.", HTTP_STATUS.BAD_REQUEST);
  }

  const reporterObjId = new Types.ObjectId(reporterId);
  const targetObjId = new Types.ObjectId(input.targetId);

  // 1. Verify target existence and ownership constraints
  if (input.targetType === "post") {
    const post = await Post.findOne({ _id: targetObjId, isDeleted: false });
    if (!post) {
      throw new AppError("The post you are trying to report does not exist.", HTTP_STATUS.NOT_FOUND);
    }
    if (post.authorId.toString() === reporterId) {
      throw new AppError("You cannot report your own post.", HTTP_STATUS.BAD_REQUEST);
    }
  } else if (input.targetType === "comment") {
    const comment = await PostComment.findOne({ _id: targetObjId, isDeleted: false });
    if (!comment) {
      throw new AppError("The comment you are trying to report does not exist.", HTTP_STATUS.NOT_FOUND);
    }
    if (comment.authorId.toString() === reporterId) {
      throw new AppError("You cannot report your own comment.", HTTP_STATUS.BAD_REQUEST);
    }
  } else if (input.targetType === "user") {
    const user = await User.findOne({ _id: targetObjId });
    if (!user) {
      throw new AppError("The member profile you are trying to report does not exist.", HTTP_STATUS.NOT_FOUND);
    }
    if (user._id.toString() === reporterId) {
      throw new AppError("You cannot report your own profile.", HTTP_STATUS.BAD_REQUEST);
    }
  }

  // 2. Check for duplicate pending report
  const existingReport = await Report.findOne({
    reporterId: reporterObjId,
    targetType: input.targetType,
    targetId: targetObjId,
  });

  if (existingReport) {
    return {
      report: existingReport,
      isDuplicate: true,
      message: "You have already submitted a report for this item. Our moderation team is reviewing it.",
    };
  }

  // 3. Create report
  const report = await Report.create({
    reporterId: reporterObjId,
    targetType: input.targetType,
    targetId: targetObjId,
    reason: input.reason,
    description: input.description?.trim() || "",
    status: "pending",
  });

  return {
    report,
    isDuplicate: false,
    message: "Thank you. Your report has been securely submitted to our moderation team.",
  };
};
