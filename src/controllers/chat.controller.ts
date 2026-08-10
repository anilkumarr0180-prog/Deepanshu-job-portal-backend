import { Request, Response } from "express";
import { HTTP_STATUS } from "../constants/http-status";
import * as chatService from "../services/chat.service";
import { asyncHandler } from "../middleware/async-handler";

import { UserRole } from "../constants/roles";

interface AuthRequest extends Request {
  user?: {
    userId: string;
    role: UserRole;
  };
}


/*
|--------------------------------------------------------------------------
| Create or Get Conversation
|--------------------------------------------------------------------------
*/
export const createOrGetConversationController = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId;
    const { jobId, targetUserId } = req.body;

    if (!jobId) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: "Job ID is required to start a conversation.",
      });
      return;
    }

    const conversation = await chatService.createOrGetConversation(
      jobId,
      targetUserId,
      userId as string
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Conversation retrieved or created successfully.",
      data: conversation,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get User Conversations
|--------------------------------------------------------------------------
*/
export const getUserConversationsController = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId as string;
    const result = await chatService.getUserConversations(userId, req.query);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Conversations fetched successfully.",
      data: result,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get Conversation Messages
|--------------------------------------------------------------------------
*/
export const getConversationMessagesController = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId as string;
    const conversationId = req.params.id as string;

    const result = await chatService.getConversationMessages(
      conversationId,
      userId,
      req.query
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Messages fetched successfully.",
      data: result,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Send Message (REST Fallback)
|--------------------------------------------------------------------------
*/
export const sendMessageController = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId as string;
    const conversationId = req.params.id as string;
    const { message, messageType, attachments } = req.body;

    const newMessage = await chatService.createMessage(
      conversationId,
      userId,
      message,
      messageType,
      attachments
    );

    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: "Message sent successfully.",
      data: newMessage,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Mark Conversation as Read
|--------------------------------------------------------------------------
*/
export const markConversationReadController = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId as string;
    const conversationId = req.params.id as string;

    const result = await chatService.markConversationMessagesAsRead(
      conversationId,
      userId
    );

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Conversation marked as read.",
      data: result,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Mark Single Message as Read
|--------------------------------------------------------------------------
*/
export const markMessageReadController = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId as string;
    const messageId = req.params.id as string;

    const updated = await chatService.markMessageAsRead(messageId, userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Message marked as read.",
      data: updated,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Get Unread Chat Messages Count
|--------------------------------------------------------------------------
*/
export const getUnreadCountController = asyncHandler(
  async (req: AuthRequest, res: Response): Promise<void> => {
    const userId = req.user?.userId as string;
    const unreadCount = await chatService.getUnreadChatCount(userId);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: "Unread chat count fetched successfully.",
      data: { unreadCount },
    });
  }
);
