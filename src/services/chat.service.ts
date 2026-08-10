import { Types } from "mongoose";
import Conversation, { IConversation } from "../models/conversation.model";
import Message, { IMessage, MessageType, IMessageAttachment } from "../models/message.model";
import Job from "../models/job.model";
import Application from "../models/application.model";
import PendingEmailNotification from "../models/pending-email.model";
import { isUserOnline } from "../config/socket";
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
  targetUserId?: string,
  currentUserId?: string
): Promise<IConversation> => {
  if (!jobId || !Types.ObjectId.isValid(jobId)) {
    throw new AppError("Invalid Job ID.", HTTP_STATUS.BAD_REQUEST);
  }

  const jobObjId = new Types.ObjectId(jobId);
  const job = await Job.findById(jobObjId).lean();
  if (!job) {
    throw new AppError("Job not found.", HTTP_STATUS.NOT_FOUND);
  }

  const recruiterIdStr = (job.recruiterId || job.postedBy)?.toString() || "";
  let candidateIdStr = "";

  if (currentUserId === recruiterIdStr) {
    candidateIdStr = targetUserId || "";
  } else {
    candidateIdStr = currentUserId || "";
  }

  if (!candidateIdStr || !recruiterIdStr) {
    throw new AppError("Invalid chat participants.", HTTP_STATUS.BAD_REQUEST);
  }

  if (candidateIdStr === recruiterIdStr) {
    throw new AppError("Cannot start conversation with yourself.", HTTP_STATUS.BAD_REQUEST);
  }

  if (!Types.ObjectId.isValid(candidateIdStr) || !Types.ObjectId.isValid(recruiterIdStr)) {
    throw new AppError("Invalid participant User IDs.", HTTP_STATUS.BAD_REQUEST);
  }

  const candidateObjId = new Types.ObjectId(candidateIdStr);
  const recruiterObjId = new Types.ObjectId(recruiterIdStr);

  /*
  |--------------------------------------------------------------------------
  | Mandatory Application Check (Explicit ObjectId matching)
  |--------------------------------------------------------------------------
  */
  const application = await Application.findOne({
    jobId: jobObjId,
    applicantId: candidateObjId,
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
  | Find or Create Conversation (Explicit ObjectId matching)
  |--------------------------------------------------------------------------
  */
  let conversation = await Conversation.findOne({
    jobId: jobObjId,
    candidateId: candidateObjId,
    recruiterId: recruiterObjId,
    isDeleted: false,
  });

  if (!conversation) {
    conversation = await Conversation.create({
      jobId: jobObjId,
      candidateId: candidateObjId,
      recruiterId: recruiterObjId,
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
| Get User Conversations (Explicit ObjectId + String matching)
|--------------------------------------------------------------------------
*/
export const getUserConversations = async (
  userId: string,
  filters: PaginationQuery = {}
) => {
  if (!userId || !Types.ObjectId.isValid(userId)) {
    return buildPaginatedResult([], 0, 1, 20);
  }

  const userObjId = new Types.ObjectId(userId);

  const query = {
    $or: [
      { candidateId: userObjId },
      { recruiterId: userObjId },
      { candidateId: userId },
      { recruiterId: userId },
    ],
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
        senderId: { $ne: userObjId },
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
  if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
    throw new AppError("Conversation not found.", HTTP_STATUS.NOT_FOUND);
  }

  const convObjId = new Types.ObjectId(conversationId);
  const conversation = await Conversation.findById(convObjId).lean();
  if (!conversation || conversation.isDeleted) {
    throw new AppError("Conversation not found.", HTTP_STATUS.NOT_FOUND);
  }

  const isCandidate = conversation.candidateId.toString() === userId;
  const isRecruiter = conversation.recruiterId.toString() === userId;

  if (!isCandidate && !isRecruiter) {
    throw new AppError("You are not authorized to view this conversation.", HTTP_STATUS.FORBIDDEN);
  }

  const userObjId = new Types.ObjectId(userId);
  const query = { 
    conversationId: convObjId, 
    deletedFor: { $ne: userObjId } // Exclude messages the user has deleted for themselves
  };
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
  const chronologicalMessages = messages.reverse().map(msg => {
    // If the message was deleted for everyone, mask its content
    if (msg.isDeleted) {
      return {
        ...msg,
        message: "🚫 This message was deleted",
        attachments: [],
        messageType: "system" as MessageType,
      };
    }
    return msg;
  });

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

  if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
    throw new AppError("Conversation not found.", HTTP_STATUS.NOT_FOUND);
  }

  const convObjId = new Types.ObjectId(conversationId);
  const senderObjId = new Types.ObjectId(senderId);

  const conversation = await Conversation.findById(convObjId);
  if (!conversation || conversation.isDeleted) {
    throw new AppError("Conversation not found.", HTTP_STATUS.NOT_FOUND);
  }

  const isCandidate = conversation.candidateId.toString() === senderId;
  const isRecruiter = conversation.recruiterId.toString() === senderId;

  if (!isCandidate && !isRecruiter) {
    throw new AppError("You are not authorized to post messages in this conversation.", HTTP_STATUS.FORBIDDEN);
  }

  const message = await Message.create({
    conversationId: convObjId,
    senderId: senderObjId,
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

  // Handle Offline Notifications Debouncing
  const recipientIdStr = isCandidate ? conversation.recruiterId.toString() : conversation.candidateId.toString();
  if (!isUserOnline(recipientIdStr)) {
    // Check if there is already a pending notification in the debounce window
    const existingPending = await PendingEmailNotification.findOne({
      recipientId: new Types.ObjectId(recipientIdStr),
      conversationId: convObjId,
    });

    if (!existingPending) {
      // 15-minute debounce window
      const sendAt = new Date(Date.now() + 15 * 60 * 1000);
      await PendingEmailNotification.create({
        recipientId: new Types.ObjectId(recipientIdStr),
        conversationId: convObjId,
        senderId: senderObjId,
        jobId: conversation.jobId,
        sendAt,
      });
      console.log(`[Notification] Scheduled email notification for offline user ${recipientIdStr} in 15 mins.`);
    }
  }

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
  if (!conversationId || !Types.ObjectId.isValid(conversationId)) {
    return { updatedCount: 0 };
  }

  const convObjId = new Types.ObjectId(conversationId);
  const userObjId = Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId;

  const result = await Message.updateMany(
    {
      conversationId: convObjId,
      senderId: { $ne: userObjId },
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
  if (!messageId || !Types.ObjectId.isValid(messageId)) {
    throw new AppError("Message not found.", HTTP_STATUS.NOT_FOUND);
  }

  const msgObjId = new Types.ObjectId(messageId);
  const message = await Message.findById(msgObjId);
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
| Edit Message
|--------------------------------------------------------------------------
*/
export const editMessage = async (
  messageId: string,
  userId: string,
  newText: string
): Promise<IMessage> => {
  if (!messageId || !Types.ObjectId.isValid(messageId)) {
    throw new AppError("Message not found.", HTTP_STATUS.NOT_FOUND);
  }
  if (!newText || !newText.trim()) {
    throw new AppError("Message content cannot be empty.", HTTP_STATUS.BAD_REQUEST);
  }

  const msgObjId = new Types.ObjectId(messageId);
  const message = await Message.findById(msgObjId);

  if (!message || message.isDeleted) {
    throw new AppError("Message not found or deleted.", HTTP_STATUS.NOT_FOUND);
  }

  if (message.senderId.toString() !== userId) {
    throw new AppError("You can only edit your own messages.", HTTP_STATUS.FORBIDDEN);
  }

  message.message = newText.trim();
  message.isEdited = true;
  await message.save();

  const populatedMessage = await Message.findById(message._id)
    .populate({ path: "senderId", select: "name email role profilePicture" })
    .exec();

  return populatedMessage as IMessage;
};

/*
|--------------------------------------------------------------------------
| Delete Message
|--------------------------------------------------------------------------
*/
export const deleteMessage = async (
  messageId: string,
  userId: string,
  deleteForEveryone: boolean
): Promise<IMessage> => {
  if (!messageId || !Types.ObjectId.isValid(messageId)) {
    throw new AppError("Message not found.", HTTP_STATUS.NOT_FOUND);
  }

  const msgObjId = new Types.ObjectId(messageId);
  const message = await Message.findById(msgObjId);

  if (!message) {
    throw new AppError("Message not found.", HTTP_STATUS.NOT_FOUND);
  }

  const userObjId = new Types.ObjectId(userId);

  if (deleteForEveryone) {
    // Only sender can delete for everyone
    if (message.senderId.toString() !== userId) {
      throw new AppError("You can only delete your own messages for everyone.", HTTP_STATUS.FORBIDDEN);
    }
    message.isDeleted = true;
  } else {
    // Delete for me
    if (!message.deletedFor.includes(userObjId)) {
      message.deletedFor.push(userObjId);
    }
  }

  await message.save();

  const populatedMessage = await Message.findById(message._id)
    .populate({ path: "senderId", select: "name email role profilePicture" })
    .exec();

  return populatedMessage as IMessage;
};

/*
|--------------------------------------------------------------------------
| Get Total Unread Count for User
|--------------------------------------------------------------------------
*/
export const getUnreadChatCount = async (userId: string): Promise<number> => {
  if (!userId || !Types.ObjectId.isValid(userId)) {
    return 0;
  }

  const userObjId = new Types.ObjectId(userId);

  const conversations = await Conversation.find({
    $or: [
      { candidateId: userObjId },
      { recruiterId: userObjId },
      { candidateId: userId },
      { recruiterId: userId },
    ],
    isDeleted: false,
  })
    .select("_id")
    .lean();

  if (!conversations.length) return 0;

  const conversationIds = conversations.map((c) => c._id);

  const unreadCount = await Message.countDocuments({
    conversationId: { $in: conversationIds },
    senderId: { $ne: userObjId },
    isRead: false,
    isDeleted: false,
  });

  return unreadCount;
};
