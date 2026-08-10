import { Types } from "mongoose";
import Conversation, { IConversation } from "../models/conversation.model";
import Message, { IMessage, MessageType, IMessageAttachment } from "../models/message.model";

import Job from "../models/job.model";
import Application from "../models/application.model";
import User from "../models/user.model";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { getPaginationOptions, buildPaginatedResult } from "../utils/pagination";

export interface PaginationQuery {
  page?: string;
  limit?: string;
}

/*
|--------------------------------------------------------------------------
| Create Or Get Conversation (Application-Gated)
|--------------------------------------------------------------------------
*/
export const createOrGetConversation = async (
  jobId: string,
  targetUserId: string,
  currentUserId: string
): Promise<IConversation> => {
  const job = await Job.findById(jobId).lean();
  if (!job) {
    throw new AppError("Job not found.", HTTP_STATUS.NOT_FOUND);
  }

  const recruiterId = job.recruiterId.toString();
  let candidateId = "";

  if (currentUserId === recruiterId) {
    candidateId = targetUserId;
  } else {
    candidateId = currentUserId;
  }

  if (!candidateId || !recruiterId) {
    throw new AppError("Invalid chat participants.", HTTP_STATUS.BAD_REQUEST);
  }

  if (candidateId === recruiterId) {
    throw new AppError("Cannot start conversation with yourself.", HTTP_STATUS.BAD_REQUEST);
  }

  /*
  |--------------------------------------------------------------------------
  | Mandatory Application Check
  |--------------------------------------------------------------------------
  | Candidate CANNOT chat with recruiter unless an active application exists.
  */
  const application = await Application.findOne({
    jobId,
    applicantId: candidateId,
    isDeleted: false,
  }).lean();

  if (!application) {
    throw new AppError(
      "Chat is disabled because candidate has not applied for this job.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  /*
  |--------------------------------------------------------------------------
  | Find or Create Conversation
  |--------------------------------------------------------------------------
  */
  let conversation = await Conversation.findOne({
    jobId,
    candidateId,
    recruiterId,
    isDeleted: false,
  });

  if (!conversation) {
    conversation = await Conversation.create({
      jobId,
      candidateId,
      recruiterId,
      lastMessageAt: new Date(),
    });
  }

  const populated = await Conversation.findById(conversation._id)
    .populate({ path: "jobId", select: "title company location status salaryMin salaryMax" })
    .populate({ path: "candidateId", select: "name email role profilePicture" })
    .populate({ path: "recruiterId", select: "name email role profilePicture" })
    .populate({ path: "lastMessageId", select: "message messageType createdAt senderId isRead" })
    .exec();

  return populated as IConversation;
};

/*
|--------------------------------------------------------------------------
| Get User Conversations
|--------------------------------------------------------------------------
*/
export const getUserConversations = async (
  userId: string,
  filters: PaginationQuery = {}
) => {
  const query = {
    $or: [{ candidateId: userId }, { recruiterId: userId }],
    isDeleted: false,
  };

  const { page, limit, skip } = getPaginationOptions(filters);

  const [conversations, totalItems] = await Promise.all([
    Conversation.find(query)
      .populate({ path: "jobId", select: "title company location status" })
      .populate({ path: "candidateId", select: "name email role profilePicture" })
      .populate({ path: "recruiterId", select: "name email role profilePicture" })
      .populate({ path: "lastMessageId", select: "message messageType createdAt senderId isRead" })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Conversation.countDocuments(query),
  ]);

  // Compute unread count for each conversation
  const conversationsWithUnread = await Promise.all(
    conversations.map(async (conv) => {
      const unreadCount = await Message.countDocuments({
        conversationId: conv._id,
        senderId: { $ne: userId },
        isRead: false,
        isDeleted: false,
      });

      return {
        ...conv,
        unreadCount,
      };
    })
  );

  return buildPaginatedResult(conversationsWithUnread, totalItems, page, limit);
};

/*
|--------------------------------------------------------------------------
| Get Conversation Messages (Paginated)
|--------------------------------------------------------------------------
*/
export const getConversationMessages = async (
  conversationId: string,
  userId: string,
  filters: PaginationQuery = {}
) => {
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation || conversation.isDeleted) {
    throw new AppError("Conversation not found.", HTTP_STATUS.NOT_FOUND);
  }

  const isCandidate = conversation.candidateId.toString() === userId;
  const isRecruiter = conversation.recruiterId.toString() === userId;

  if (!isCandidate && !isRecruiter) {
    throw new AppError("You are not authorized to view this conversation.", HTTP_STATUS.FORBIDDEN);
  }

  const query = { conversationId, isDeleted: false };
  const { page, limit, skip } = getPaginationOptions(filters);

  const [messages, totalItems] = await Promise.all([
    Message.find(query)
      .populate({ path: "senderId", select: "name email role profilePicture" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Message.countDocuments(query),
  ]);

  // Reverse so frontend gets chronological order (oldest to newest in page)
  const chronologicalMessages = messages.reverse();

  return buildPaginatedResult(chronologicalMessages, totalItems, page, limit);
};

/*
|--------------------------------------------------------------------------
| Send Message
|--------------------------------------------------------------------------
*/
export const createMessage = async (
  conversationId: string,
  senderId: string,
  messageText: string,
  messageType: MessageType = "text",
  attachments: IMessageAttachment[] = []
): Promise<IMessage> => {
  if (!messageText || !messageText.trim()) {
    throw new AppError("Message content cannot be empty.", HTTP_STATUS.BAD_REQUEST);
  }

  if (messageText.length > 5000) {
    throw new AppError("Message content exceeds limit of 5000 characters.", HTTP_STATUS.BAD_REQUEST);
  }

  const conversation = await Conversation.findById(conversationId);
  if (!conversation || conversation.isDeleted) {
    throw new AppError("Conversation not found.", HTTP_STATUS.NOT_FOUND);
  }

  const isCandidate = conversation.candidateId.toString() === senderId;
  const isRecruiter = conversation.recruiterId.toString() === senderId;

  if (!isCandidate && !isRecruiter) {
    throw new AppError("You are not authorized to post messages in this conversation.", HTTP_STATUS.FORBIDDEN);
  }

  const message = await Message.create({
    conversationId,
    senderId,
    message: messageText.trim(),
    messageType,
    attachments,
    isRead: false,
  });

  conversation.lastMessageId = message._id as Types.ObjectId;
  conversation.lastMessageAt = new Date();
  await conversation.save();

  const populatedMessage = await Message.findById(message._id)
    .populate({ path: "senderId", select: "name email role profilePicture" })
    .exec();

  return populatedMessage as IMessage;
};

/*
|--------------------------------------------------------------------------
| Mark Conversation Messages as Read
|--------------------------------------------------------------------------
*/
export const markConversationMessagesAsRead = async (
  conversationId: string,
  userId: string
): Promise<{ updatedCount: number }> => {
  const conversation = await Conversation.findById(conversationId).lean();
  if (!conversation || conversation.isDeleted) {
    throw new AppError("Conversation not found.", HTTP_STATUS.NOT_FOUND);
  }

  const isCandidate = conversation.candidateId.toString() === userId;
  const isRecruiter = conversation.recruiterId.toString() === userId;

  if (!isCandidate && !isRecruiter) {
    throw new AppError("Not authorized.", HTTP_STATUS.FORBIDDEN);
  }

  const result = await Message.updateMany(
    {
      conversationId,
      senderId: { $ne: userId },
      isRead: false,
    },
    {
      $set: { isRead: true, readAt: new Date() },
    }
  );

  return { updatedCount: result.modifiedCount };
};

/*
|--------------------------------------------------------------------------
| Mark Single Message as Read
|--------------------------------------------------------------------------
*/
export const markMessageAsRead = async (
  messageId: string,
  userId: string
): Promise<IMessage> => {
  const message = await Message.findById(messageId);
  if (!message || message.isDeleted) {
    throw new AppError("Message not found.", HTTP_STATUS.NOT_FOUND);
  }

  const conversation = await Conversation.findById(message.conversationId).lean();
  if (!conversation) {
    throw new AppError("Conversation not found.", HTTP_STATUS.NOT_FOUND);
  }

  const isRecipient =
    (conversation.candidateId.toString() === userId || conversation.recruiterId.toString() === userId) &&
    message.senderId.toString() !== userId;

  if (!isRecipient) {
    return message;
  }

  message.isRead = true;
  message.readAt = new Date();
  await message.save();

  return message;
};

/*
|--------------------------------------------------------------------------
| Get Total Unread Count for User
|--------------------------------------------------------------------------
*/
export const getUnreadChatCount = async (userId: string): Promise<number> => {
  const conversations = await Conversation.find({
    $or: [{ candidateId: userId }, { recruiterId: userId }],
    isDeleted: false,
  })
    .select("_id")
    .lean();

  if (!conversations.length) return 0;

  const conversationIds = conversations.map((c) => c._id);

  const unreadCount = await Message.countDocuments({
    conversationId: { $in: conversationIds },
    senderId: { $ne: userId },
    isRead: false,
    isDeleted: false,
  });

  return unreadCount;
};
