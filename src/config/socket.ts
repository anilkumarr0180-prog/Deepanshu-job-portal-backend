import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { verifyAccessToken } from "../utils/jwt";
import { UserRole } from "../constants/roles";
import Conversation from "../models/conversation.model";
import * as chatService from "../services/chat.service";
import * as locationService from "../services/location.service";
import { LocationPrivacyLevel, LOCATION_CONFIG } from "../constants/location";

export interface AuthenticatedSocket extends Socket {
  user?: {
    userId: string;
    role: UserRole;
  };
}

let io: Server | null = null;
export const onlineUsersMap = new Map<string, Set<string>>(); // userId -> Set of socketIds

export const isUserOnline = (userId: string): boolean => {
  const sockets = onlineUsersMap.get(userId);
  return !!sockets && sockets.size > 0;
};

export const initSocketServer = (
  httpServer: HttpServer,
  allowedOrigins: string[]
): Server => {
  io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(null, true);
        }
      },
      credentials: true,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  /*
  |--------------------------------------------------------------------------
  | Socket Authentication Middleware
  |--------------------------------------------------------------------------
  */
  io.use((socket: AuthenticatedSocket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace("Bearer ", "");

      if (!token) {
        return next(new Error("Authentication required for WebSocket connection."));
      }

      const cleanToken = token.replace("Bearer ", "").trim();
      const decodedUser = verifyAccessToken(cleanToken);

      socket.user = {
        userId: decodedUser.userId,
        role: decodedUser.role as UserRole,
      };

      next();
    } catch (err) {
      console.error("Socket authentication error:", err);
      next(new Error("Invalid or expired authentication token."));
    }
  });

  /*
  |--------------------------------------------------------------------------
  | Connection & Event Handlers
  |--------------------------------------------------------------------------
  */
  io.on("connection", (socket: AuthenticatedSocket) => {
    const userId = socket.user?.userId;
    if (!userId) return;

    // Join personal user room
    const userRoom = `user_${userId}`;
    socket.join(userRoom);

    // Track online user
    if (!onlineUsersMap.has(userId)) {
      onlineUsersMap.set(userId, new Set());
    }
    onlineUsersMap.get(userId)?.add(socket.id);

    // Broadcast updated online user IDs to all sockets and emit immediately to current socket
    const currentOnlineList = Array.from(onlineUsersMap.keys());
    socket.emit("online_users", currentOnlineList);
    io?.emit("online_users", currentOnlineList);

    console.log(`⚡ Socket client connected: ${socket.id} (User: ${userId}, Room: ${userRoom})`);

    /*
    |--------------------------------------------------------------------------
    | Join Conversation Room
    |--------------------------------------------------------------------------
    */
    socket.on("join_conversation", async (data: { conversationId: string }) => {
      try {
        const { conversationId } = data;
        if (!conversationId) return;

        const conversation = await Conversation.findById(conversationId).lean();
        if (!conversation || conversation.isDeleted) {
          socket.emit("error", { message: "Conversation not found." });
          return;
        }

        const isCandidate = conversation.candidateId.toString() === userId;
        const isRecruiter = conversation.recruiterId.toString() === userId;

        if (!isCandidate && !isRecruiter) {
          socket.emit("error", { message: "Unauthorized access to conversation." });
          return;
        }

        const convRoom = `conversation_${conversationId}`;
        socket.join(convRoom);
        console.log(`💬 Socket ${socket.id} (User ${userId}) joined room ${convRoom}`);

        socket.emit("joined_conversation", { conversationId });
      } catch (err) {
        console.error("Error in join_conversation:", err);
        socket.emit("error", { message: "Failed to join conversation." });
      }
    });

    /*
    |--------------------------------------------------------------------------
    | Leave Conversation Room
    |--------------------------------------------------------------------------
    */
    socket.on("leave_conversation", (data: { conversationId: string }) => {
      const { conversationId } = data;
      if (conversationId) {
        const convRoom = `conversation_${conversationId}`;
        socket.leave(convRoom);
        console.log(`💬 Socket ${socket.id} left room ${convRoom}`);
      }
    });

    /*
    |--------------------------------------------------------------------------
    | Send Message
    |--------------------------------------------------------------------------
    */
    socket.on(
      "send_message",
      async (data: {
        conversationId: string;
        message: string;
        messageType?: "text" | "image" | "file" | "system";
        attachments?: Array<{ url: string; name?: string; size?: number; mimeType?: string }>;
      }) => {
        try {
          const { conversationId, message, messageType = "text", attachments = [] } = data;
          if (!conversationId || !message || !message.trim()) {
            socket.emit("error", { message: "Conversation ID and non-empty message are required." });
            return;
          }

          // Save message to DB
          const createdMessage = await chatService.createMessage(
            conversationId,
            userId,
            message,
            messageType,
            attachments
          );

          const convRoom = `conversation_${conversationId}`;

          // Broadcast to everyone in conversation room
          io?.to(convRoom).emit("message_received", {
            message: createdMessage,
            conversationId,
          });

          // Fetch updated conversation to notify recipient user room
          const conversation = await Conversation.findById(conversationId).lean();
          if (conversation) {
            const recipientId =
              conversation.candidateId.toString() === userId
                ? conversation.recruiterId.toString()
                : conversation.candidateId.toString();

            const recipientRoom = `user_${recipientId}`;
            const unreadTotal = await chatService.getUnreadChatCount(recipientId);

            io?.to(recipientRoom).emit("conversation_updated", {
              conversationId,
              lastMessage: createdMessage,
              unreadTotal,
            });
          }
        } catch (err: unknown) {
          const errorMsg = (err as Error).message || "Failed to send message.";
          console.error("Error in send_message socket handler:", err);
          socket.emit("error", { message: errorMsg });
        }
      }
    );

    /*
    |--------------------------------------------------------------------------
    | Edit Message
    |--------------------------------------------------------------------------
    */
    socket.on(
      "edit_message",
      async (data: { conversationId: string; messageId: string; newText: string }) => {
        try {
          const { conversationId, messageId, newText } = data;
          if (!conversationId || !messageId || !newText || !newText.trim()) return;

          const editedMessage = await chatService.editMessage(messageId, userId, newText);
          const convRoom = `conversation_${conversationId}`;

          io?.to(convRoom).emit("message_edited", {
            message: editedMessage,
            conversationId,
          });

          // Fetch updated conversation to notify recipient user room (to update sidebar preview)
          const conversation = await Conversation.findById(conversationId).lean();
          if (conversation && conversation.lastMessageId?.toString() === messageId) {
            const recipientId =
              conversation.candidateId.toString() === userId
                ? conversation.recruiterId.toString()
                : conversation.candidateId.toString();

            const recipientRoom = `user_${recipientId}`;
            io?.to(recipientRoom).emit("conversation_updated", {
              conversationId,
              lastMessage: editedMessage,
              unreadTotal: await chatService.getUnreadChatCount(recipientId),
            });
            // Update sender's sidebar too
            io?.to(`user_${userId}`).emit("conversation_updated", {
              conversationId,
              lastMessage: editedMessage,
              unreadTotal: await chatService.getUnreadChatCount(userId),
            });
          }
        } catch (err: unknown) {
          const errorMsg = (err as Error).message || "Failed to edit message.";
          socket.emit("error", { message: errorMsg });
        }
      }
    );

    /*
    |--------------------------------------------------------------------------
    | Delete Message
    |--------------------------------------------------------------------------
    */
    socket.on(
      "delete_message",
      async (data: { conversationId: string; messageId: string; deleteForEveryone: boolean }) => {
        try {
          const { conversationId, messageId, deleteForEveryone } = data;
          if (!conversationId || !messageId) return;

          const deletedMessage = await chatService.deleteMessage(messageId, userId, deleteForEveryone);
          
          if (deleteForEveryone) {
            // Mask content for broadcasting
            const maskedMessage = {
              ...deletedMessage.toObject(),
              message: "🚫 This message was deleted",
              attachments: [],
              messageType: "system",
            };
            
            const convRoom = `conversation_${conversationId}`;
            io?.to(convRoom).emit("message_deleted", {
              message: maskedMessage,
              conversationId,
              deleteForEveryone,
              deletedByUserId: userId,
            });
          } else {
            // Only deleted for me, so only notify the sender's own socket
            socket.emit("message_deleted", {
              message: deletedMessage,
              conversationId,
              deleteForEveryone,
              deletedByUserId: userId,
            });
          }
        } catch (err: unknown) {
          const errorMsg = (err as Error).message || "Failed to delete message.";
          socket.emit("error", { message: errorMsg });
        }
      }
    );

    /*
    |--------------------------------------------------------------------------
    | Typing Indicators
    |--------------------------------------------------------------------------
    */
    socket.on("typing_start", (data: { conversationId: string; userName?: string }) => {
      const { conversationId, userName } = data;
      if (conversationId) {
        socket.to(`conversation_${conversationId}`).emit("user_typing", {
          conversationId,
          userId,
          userName: userName || "User",
        });
      }
    });

    socket.on("typing_stop", (data: { conversationId: string }) => {
      const { conversationId } = data;
      if (conversationId) {
        socket.to(`conversation_${conversationId}`).emit("user_stop_typing", {
          conversationId,
          userId,
        });
      }
    });

    /*
    |--------------------------------------------------------------------------
    | Mark Messages as Read (Double Ticks Sync)
    |--------------------------------------------------------------------------
    */
    socket.on("mark_read", async (data: { conversationId: string }) => {
      try {
        const { conversationId } = data;
        if (!conversationId) return;

        await chatService.markConversationMessagesAsRead(conversationId, userId);
        const readAt = new Date();

        const readPayload = {
          conversationId,
          readByUserId: userId,
          readAt,
        };

        // Broadcast read status to active conversation room
        io?.to(`conversation_${conversationId}`).emit("messages_read", readPayload);

        // Also broadcast to individual user rooms to ensure sender updates ticks even if not in conversation room
        const conversation = await Conversation.findById(conversationId).lean();
        if (conversation) {
          const candidateRoom = `user_${conversation.candidateId.toString()}`;
          const recruiterRoom = `user_${conversation.recruiterId.toString()}`;
          io?.to(candidateRoom).emit("messages_read", readPayload);
          io?.to(recruiterRoom).emit("messages_read", readPayload);

          const unreadTotal = await chatService.getUnreadChatCount(userId);
          socket.emit("unread_count_updated", { unreadTotal });
        }
      } catch (err) {
        console.error("Error in mark_read socket handler:", err);
      }
    });

    /*
    |--------------------------------------------------------------------------
    | Disconnect Handler
    |--------------------------------------------------------------------------
    */
    socket.on("disconnect", (reason) => {
      // Differentiate normal client lifecycle (navigating/closing tab/polling abort) from unexpected server issues
      const isExpectedClosure =
        reason === "transport close" ||
        reason === "client namespace disconnect" ||
        reason === "transport error" ||
        reason === "ping timeout";
      if (process.env.NODE_ENV === "development" || !isExpectedClosure) {
        console.log(`🔌 Socket client disconnected: ${socket.id} (${reason})`);
      }

      const userSockets = onlineUsersMap.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsersMap.delete(userId);
        }
      }

      // Broadcast updated online user list
      io?.emit("online_users", Array.from(onlineUsersMap.keys()));
    });
  });

  return io;
};

export const getIO = (): Server => {
  if (!io) {
    throw new Error("Socket.io has not been initialized!");
  }
  return io;
};

export const emitNotificationToUser = (
  recipientId: string,
  notification: unknown,
  unreadCount?: number
) => {
  if (!io) return;
  const userRoom = `user_${recipientId}`;
  io.to(userRoom).emit("notification:new", notification);
  if (typeof unreadCount === "number") {
    io.to(userRoom).emit("notification:unread_count", { unreadCount });
  }
};

export const broadcastNotification = (notification: unknown) => {
  if (!io) return;
  io.emit("notification:broadcast", notification);
};
