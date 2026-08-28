import { Types } from "mongoose";
import Conversation, { IConversation } from "../models/conversation.model";
import Message, { IMessage, MessageType, IMessageAttachment } from "../models/message.model";
import Job from "../models/job.model";
import User from "../models/user.model";
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
| Create Or Get Conversation (Job Application or Direct Networking)
|--------------------------------------------------------------------------
*/
export const createOrGetConversation = async (
  jobId?: string,
  targetUserId?: string,
  currentUserId?: string
): Promise<IConversation> => {
  if (!currentUserId || !Types.ObjectId.isValid(currentUserId)) {
    throw new AppError("Invalid or missing user ID.", HTTP_STATUS.UNAUTHORIZED);
  }

  const currentUserObjId = new Types.ObjectId(currentUserId);

  /*
  |--------------------------------------------------------------------------
  | 1. Direct Peer-to-Peer / Networking Conversation (No Job ID)
  |--------------------------------------------------------------------------
  */
  if (!jobId) {
    if (!targetUserId || !Types.ObjectId.isValid(targetUserId)) {
      throw new AppError("Target user ID is required to start a direct conversation.", HTTP_STATUS.BAD_REQUEST);
    }

    if (currentUserId === targetUserId) {
      throw new AppError("Cannot start conversation with yourself.", HTTP_STATUS.BAD_REQUEST);
    }

    const targetUserObjId = new Types.ObjectId(targetUserId);
    const targetUser = await User.findById(targetUserObjId).lean();
    if (!targetUser) {
      throw new AppError("Target user not found.", HTTP_STATUS.NOT_FOUND);
    }

    // Find if a direct conversation already exists between these 2 users (order-agnostic)
    let conversation = await Conversation.findOne({
      jobId: null,
      $or: [
        { candidateId: currentUserObjId, recruiterId: targetUserObjId },
        { candidateId: targetUserObjId, recruiterId: currentUserObjId },
      ],
    });

    if (conversation) {
      if (conversation.isDeleted) {
        conversation.isDeleted = false;
        conversation.lastMessageAt = new Date();
        await conversation.save();
      }
    } else {
      try {
        conversation = await Conversation.create({
          candidateId: currentUserObjId,
          recruiterId: targetUserObjId,
          lastMessageAt: new Date(),
          isDeleted: false,
        });
      } catch (err: any) {
        if (err.code === 11000) {
          conversation = await Conversation.findOne({
            jobId: null,
            $or: [
              { candidateId: currentUserObjId, recruiterId: targetUserObjId },
              { candidateId: targetUserObjId, recruiterId: currentUserObjId },
            ],
          });
          if (conversation && conversation.isDeleted) {
            conversation.isDeleted = false;
            await conversation.save();
          }
        } else {
          throw err;
        }
      }
    }

    if (!conversation) {
      throw new AppError("Failed to retrieve or create conversation.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    const populated = await Conversation.findById(conversation._id)
      .populate({ path: "jobId", select: "title company location status salaryMin salaryMax" })
      .populate({ path: "candidateId", select: "name email role profilePicture" })
      .populate({ path: "recruiterId", select: "name email role profilePicture" })
      .populate({ path: "lastMessageId", select: "message messageType createdAt senderId isRead" })
      .exec();

    return populated as IConversation;
  }

  /*
  |--------------------------------------------------------------------------
  | 2. Job-Gated Conversation (Application-Gated)
  |--------------------------------------------------------------------------
  */
  if (!Types.ObjectId.isValid(jobId)) {
    throw new AppError("Invalid Job ID.", HTTP_STATUS.BAD_REQUEST);
  }

  const jobObjId = new Types.ObjectId(jobId);
  const job = await Job.findById(jobObjId).lean();
  if (!job) {
    throw new AppError("Job not found.", HTTP_STATUS.NOT_FOUND);
  }

  const recruiterIdStr = job.recruiterId?.toString() || "";
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

  let conversation = await Conversation.findOne({
    jobId: jobObjId,
    candidateId: candidateObjId,
    recruiterId: recruiterObjId,
  });

  if (conversation) {
    if (conversation.isDeleted) {
      conversation.isDeleted = false;
      conversation.lastMessageAt = new Date();
      await conversation.save();
    }
  } else {
    try {
      conversation = await Conversation.create({
        jobId: jobObjId,
        candidateId: candidateObjId,
        recruiterId: recruiterObjId,
        lastMessageAt: new Date(),
        isDeleted: false,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        conversation = await Conversation.findOne({
          jobId: jobObjId,
          candidateId: candidateObjId,
          recruiterId: recruiterObjId,
        });
        if (conversation && conversation.isDeleted) {
          conversation.isDeleted = false;
          await conversation.save();
        }
      } else {
        throw err;
      }
    }
  }

  if (!conversation) {
    throw new AppError("Failed to retrieve or create conversation.", HTTP_STATUS.INTERNAL_SERVER_ERROR);
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
| Get User Conversations (Explicit ObjectId matching + Unread Counts)
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

  // P2: Clean canonical ObjectId query
  const query = {
    $or: [
      { candidateId: userObjId },
      { recruiterId: userObjId },
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

  // Compute unread count for each conversation in a single aggregated batch query (Zero N+1)
  const convIds = conversations.map((conv) => conv._id);
  const unreadCountsMap = new Map<string, number>();

  if (convIds.length > 0) {
    // P1: Exclude deletedFor messages from unread counts
    const unreadAgg = await Message.aggregate([
      {
        $match: {
          conversationId: { $in: convIds },
          senderId: { $ne: userObjId },
          deletedFor: { $ne: userObjId },
          isRead: false,
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: "$conversationId",
          count: { $sum: 1 },
        },
      },
    ]);

    for (const item of unreadAgg) {
      unreadCountsMap.set(item._id.toString(), item.count);
    }
  }

  const conversationsWithUnread = conversations.map((conv) => ({
    ...conv,
    unreadCount: unreadCountsMap.get(conv._id.toString()) || 0,
  }));

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
  messageText: string = "",
  messageType: MessageType = "text",
  attachments: IMessageAttachment[] = []
): Promise<IMessage> => {
  let content = (messageText || "").trim();

  // If voice message, provide safe fallback text if empty
  if (messageType === "voice") {
    if (!attachments || attachments.length === 0 || !attachments[0]?.url) {
      throw new AppError("Voice messages require an audio attachment.", HTTP_STATUS.BAD_REQUEST);
    }
    if (!content) {
      content = "🎤 Voice message";
    }
  }

  if (!content) {
    throw new AppError("Message content cannot be empty.", HTTP_STATUS.BAD_REQUEST);
  }

  if (content.length > 5000) {
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
    message: content,
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
    throw new AppError("Invalid Conversation ID.", HTTP_STATUS.BAD_REQUEST);
  }
  if (!userId || !Types.ObjectId.isValid(userId)) {
    throw new AppError("Invalid User ID.", HTTP_STATUS.BAD_REQUEST);
  }

  const convObjId = new Types.ObjectId(conversationId);
  const userObjId = new Types.ObjectId(userId);

  // P1: Validate conversation existence, soft-delete state, and participant authorization
  const conversation = await Conversation.findById(convObjId).lean();
  if (!conversation || conversation.isDeleted) {
    throw new AppError("Conversation not found.", HTTP_STATUS.NOT_FOUND);
  }

  const isCandidate = conversation.candidateId.toString() === userId;
  const isRecruiter = conversation.recruiterId.toString() === userId;

  if (!isCandidate && !isRecruiter) {
    throw new AppError("You are not authorized to mark messages in this conversation as read.", HTTP_STATUS.FORBIDDEN);
  }

  const result = await Message.updateMany(
    {
      conversationId: convObjId,
      senderId: { $ne: userObjId },
      deletedFor: { $ne: userObjId },
      isRead: false,
      isDeleted: false,
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

  if (message.messageType === "voice") {
    throw new AppError("Voice messages cannot be edited.", HTTP_STATUS.BAD_REQUEST);
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

  // P2: Clean canonical ObjectId query
  const conversations = await Conversation.find({
    $or: [
      { candidateId: userObjId },
      { recruiterId: userObjId },
    ],
    isDeleted: false,
  })
    .select("_id")
    .lean();

  if (!conversations.length) return 0;

  const conversationIds = conversations.map((c) => c._id);

  // P1: Exclude deletedFor messages from unread counts
  const unreadCount = await Message.countDocuments({
    conversationId: { $in: conversationIds },
    senderId: { $ne: userObjId },
    deletedFor: { $ne: userObjId },
    isRead: false,
    isDeleted: false,
  });

  return unreadCount;
};
