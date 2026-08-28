import { Types } from "mongoose";
import Call, { ICall } from "../models/call.model";
import Conversation from "../models/conversation.model";
import "../models/user.model";
import "../models/job.model";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { getPaginationOptions, buildPaginatedResult } from "../utils/pagination";
import { SaveCallTerminalInput, CallHistoryFilterQuery } from "../types/call.types";

/*
|--------------------------------------------------------------------------
| 1. Save / Upsert Call Record (Idempotent Terminal State)
|--------------------------------------------------------------------------
*/
export const saveCallRecord = async (
  input: SaveCallTerminalInput
): Promise<ICall> => {
  if (!input.callId) {
    throw new AppError("Call ID is required to persist call record.", HTTP_STATUS.BAD_REQUEST);
  }

  if (
    !Types.ObjectId.isValid(input.conversationId) ||
    !Types.ObjectId.isValid(input.callerId) ||
    !Types.ObjectId.isValid(input.receiverId)
  ) {
    throw new AppError("Invalid participant or conversation ObjectIds.", HTTP_STATUS.BAD_REQUEST);
  }

  // Server-side precise duration calculation
  let durationSeconds = 0;
  if (input.status === "ended" && input.acceptedAt && input.endedAt) {
    const diffMs = input.endedAt.getTime() - input.acceptedAt.getTime();
    durationSeconds = Math.max(0, Math.floor(diffMs / 1000));
  }

  const convObjId = new Types.ObjectId(input.conversationId);
  const callerObjId = new Types.ObjectId(input.callerId);
  const receiverObjId = new Types.ObjectId(input.receiverId);

  const callDoc = await Call.findOneAndUpdate(
    { callId: input.callId },
    {
      $setOnInsert: {
        callId: input.callId,
        conversationId: convObjId,
        callerId: callerObjId,
        receiverId: receiverObjId,
        startedAt: input.startedAt,
      },
      $set: {
        status: input.status,
        answeredAt: input.acceptedAt || undefined,
        endedAt: input.endedAt || undefined,
        durationSeconds,
        endReason: input.endReason,
        isMissedCallRead: input.status === "missed" ? false : true,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  return callDoc as unknown as ICall;
};

/*
|--------------------------------------------------------------------------
| 2. Get User Call History (Paginated)
|--------------------------------------------------------------------------
*/
export const getUserCallHistory = async (
  userId: string,
  filters: CallHistoryFilterQuery = {}
) => {
  if (!userId || !Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid or missing user ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const userObjId = new Types.ObjectId(userId);

  const query: Record<string, unknown> = {
    $or: [{ callerId: userObjId }, { receiverId: userObjId }],
  };

  if (filters.conversationId) {
    if (!Types.ObjectId.isValid(filters.conversationId)) {
      throw new AppError("Invalid Conversation ID format.", HTTP_STATUS.BAD_REQUEST);
    }
    query.conversationId = new Types.ObjectId(filters.conversationId);
  }

  if (filters.status) {
    query.status = filters.status;
  }

  const { page, limit, skip } = getPaginationOptions(filters);

  const [calls, totalItems] = await Promise.all([
    Call.find(query)
      .populate({ path: "callerId", select: "name email role profilePicture" })
      .populate({ path: "receiverId", select: "name email role profilePicture" })
      .populate({
        path: "conversationId",
        select: "jobId candidateId recruiterId lastMessageAt",
        populate: { path: "jobId", select: "title company location" },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Call.countDocuments(query),
  ]);

  return buildPaginatedResult(calls, totalItems, page, limit);
};

/*
|--------------------------------------------------------------------------
| 3. Get Conversation Call History (Paginated)
|--------------------------------------------------------------------------
*/
export const getConversationCallHistory = async (
  conversationId: string,
  userId: string,
  filters: CallHistoryFilterQuery = {}
) => {
  if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
    throw new AppError("Invalid Conversation ID.", HTTP_STATUS.BAD_REQUEST);
  }
  if (!userId || !Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid User ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const convObjId = new Types.ObjectId(conversationId);
  const conversation = await Conversation.findById(convObjId).lean();
  if (!conversation || conversation.isDeleted) {
    throw new AppError("Conversation not found.", HTTP_STATUS.NOT_FOUND);
  }

  const isCandidate = conversation.candidateId.toString() === userId;
  const isRecruiter = conversation.recruiterId.toString() === userId;

  if (!isCandidate && !isRecruiter) {
    throw new AppError("You are not authorized to view this conversation call history.", HTTP_STATUS.FORBIDDEN);
  }

  const query: Record<string, unknown> = {
    conversationId: convObjId,
  };

  if (filters.status) {
    query.status = filters.status;
  }

  const { page, limit, skip } = getPaginationOptions(filters);

  const [calls, totalItems] = await Promise.all([
    Call.find(query)
      .populate({ path: "callerId", select: "name email role profilePicture" })
      .populate({ path: "receiverId", select: "name email role profilePicture" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Call.countDocuments(query),
  ]);

  return buildPaginatedResult(calls, totalItems, page, limit);
};

/*
|--------------------------------------------------------------------------
| 4. Get Unread Missed Calls Count for User
|--------------------------------------------------------------------------
*/
export const getUnreadMissedCallsCount = async (userId: string): Promise<number> => {
  if (!userId || !Types.ObjectId.isValid(userId)) {
    return 0;
  }

  const userObjId = new Types.ObjectId(userId);
  return await Call.countDocuments({
    receiverId: userObjId,
    status: "missed",
    isMissedCallRead: false,
  });
};

/*
|--------------------------------------------------------------------------
| 5. Mark Missed Calls as Read
|--------------------------------------------------------------------------
*/
export const markMissedCallsAsRead = async (
  userId: string,
  conversationId?: string
): Promise<{ updatedCount: number }> => {
  if (!userId || !Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid User ID.", HTTP_STATUS.BAD_REQUEST);
  }

  const userObjId = new Types.ObjectId(userId);
  const filter: Record<string, unknown> = {
    receiverId: userObjId,
    status: "missed",
    isMissedCallRead: false,
  };

  if (conversationId) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new AppError("Invalid Conversation ID format.", HTTP_STATUS.BAD_REQUEST);
    }
    filter.conversationId = new Types.ObjectId(conversationId);
  }

  const result = await Call.updateMany(filter, {
    $set: { isMissedCallRead: true },
  });

  return { updatedCount: result.modifiedCount };
};
