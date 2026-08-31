const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '../../../client/src');

// 1. Update RealtimeContext.tsx
const realtimePath = path.join(clientRoot, 'shared/context/RealtimeContext.tsx');
let realtime = fs.readFileSync(realtimePath, 'utf8');

// Replace handleMessageReceived and handleConversationUpdated
const oldHandlerBlock = `    // 1. Message Received
    const handleMessageReceived = (data: { message: ChatMessage; conversationId: string }) => {
      const { message, conversationId } = data;
      if (!message || !conversationId) return;
      const senderIdStr = getUserIdString(message.senderId);
      const isViewing = activeConversationIdRef.current === conversationId;
      const isFromOther = senderIdStr !== currentUserIdRef.current;

      // Unhide conversation if it was deleted previously
      try {
        const key = "jobbox_deleted_convs";
        const deletedMap = JSON.parse(localStorage.getItem(key) || "{}");
        if (deletedMap[conversationId]) {
          delete deletedMap[conversationId];
          localStorage.setItem(key, JSON.stringify(deletedMap));
        }
      } catch {
        // ignore
      }

      // Clear any active typing indicator for sender
      if (isFromOther) {
        dispatch(setUserStopTyping({ conversationId, userId: senderIdStr }));
      }

      // Optimistically append to all cached message lists for this conversation
      queryClient.setQueriesData(
        { queryKey: ["messages", conversationId] },
        (old: { messages: ChatMessage[]; pagination?: unknown } | undefined) => {
          if (!old) return { messages: [message] };
          const exists = old.messages?.some(
            (m) => (m._id || m.id) === (message._id || message.id)
          );
          if (exists) return old;
          return { ...old, messages: [...(old.messages || []), message] };
        }
      );

      // Directly update conversation preview, per-conversation unread count, and reorder to top
      queryClient.setQueriesData(
        { queryKey: ["conversations"] },
        (old: any) => {
          if (!old?.conversations) return old;
          let targetConv: any = null;
          const remainingConvs = old.conversations.filter((c: any) => {
            if ((c._id || c.id) === conversationId) {
              targetConv = {
                ...c,
                lastMessageId: message,
                lastMessageAt: message.createdAt || new Date().toISOString(),
                unreadCount: isViewing || !isFromOther ? 0 : (c.unreadCount || 0) + 1,
              };
              return false;
            }
            return true;
          });
          return {
            ...old,
            conversations: targetConv ? [targetConv, ...remainingConvs] : old.conversations,
          };
        }
      );

      // If NOT viewing and from other user, increment global unread count
      if (!isViewing && isFromOther) {
        dispatch(incrementUnreadCount());
        queryClient.setQueryData(["unread-chat-count"], (prev: number | undefined) =>
          typeof prev === "number" ? prev + 1 : 1
        );
      }

      // If actively looking at this conversation, auto mark as read
      if (isViewing && isFromOther) {
        socketInstance.emit("mark_read", { conversationId });
      }
    };

    // 2. Conversation Updated (Handles background message arrives for recipient or preview update for sender)
    const handleConversationUpdated = (data: {
      conversationId: string;
      lastMessage: ChatMessage;
      unreadTotal?: number;
      unreadCount?: number;
    }) => {
      if (typeof data.unreadTotal === "number") {
        dispatch(setUnreadTotalCount(data.unreadTotal));
        queryClient.setQueryData(["unread-chat-count"], data.unreadTotal);
      }

      if (data.conversationId && data.lastMessage) {
        const isViewing = activeConversationIdRef.current === data.conversationId;
        const senderIdStr = getUserIdString(data.lastMessage.senderId);
        const isFromOther = senderIdStr !== currentUserIdRef.current;

        // If viewing this conversation, ensure the message is appended to the active chat window cache
        if (isViewing) {
          queryClient.setQueriesData(
            { queryKey: ["messages", data.conversationId] },
            (old: { messages: ChatMessage[]; pagination?: unknown } | undefined) => {
              if (!old) return { messages: [data.lastMessage] };
              const exists = old.messages?.some(
                (m) => (m._id || m.id) === (data.lastMessage._id || data.lastMessage.id)
              );
              if (exists) return old;
              return { ...old, messages: [...(old.messages || []), data.lastMessage] };
            }
          );

          if (isFromOther) {
            socketInstance.emit("mark_read", { conversationId: data.conversationId });
          }
        }

        queryClient.setQueriesData(
          { queryKey: ["conversations"] },
          (old: any) => {
            if (!old?.conversations) return old;
            let targetConv: any = null;
            const remainingConvs = old.conversations.filter((c: any) => {
              if ((c._id || c.id) === data.conversationId) {
                const alreadyUpdatedWithMsg =
                  (c.lastMessageId?._id || c.lastMessageId?.id) ===
                  (data.lastMessage._id || data.lastMessage.id);

                let nextUnread = c.unreadCount || 0;
                if (typeof data.unreadCount === "number") {
                  nextUnread = data.unreadCount;
                } else if (isViewing || !isFromOther) {
                  nextUnread = 0;
                } else if (!alreadyUpdatedWithMsg) {
                  nextUnread = (c.unreadCount || 0) + 1;
                }

                targetConv = {
                  ...c,
                  lastMessageId: data.lastMessage,
                  lastMessageAt: data.lastMessage.createdAt || new Date().toISOString(),
                  unreadCount: nextUnread,
                };
                return false;
              }
              return true;
            });

            return {
              ...old,
              conversations: targetConv ? [targetConv, ...remainingConvs] : old.conversations,
            };
          }
        );
      }
    };`;

const newHandlerBlock = `    // 1. Message Received (Guaranteed Realtime Cache Sync)
    const handleMessageReceived = (data: { message: ChatMessage; conversationId: string }) => {
      const { message, conversationId } = data;
      if (!message || !conversationId) return;
      const senderIdStr = getUserIdString(message.senderId);
      const isViewing = activeConversationIdRef.current === conversationId;
      const isFromOther = senderIdStr !== currentUserIdRef.current;

      // Unhide conversation if it was deleted previously (user-namespaced)
      try {
        const key = "jobbox_deleted_convs_" + currentUserIdRef.current;
        const deletedMap = JSON.parse(localStorage.getItem(key) || "{}");
        if (deletedMap[conversationId]) {
          delete deletedMap[conversationId];
          localStorage.setItem(key, JSON.stringify(deletedMap));
        }
      } catch {
        // ignore
      }

      // Clear any active typing indicator for sender
      if (isFromOther) {
        dispatch(setUserStopTyping({ conversationId, userId: senderIdStr }));
      }

      // Optimistically append to all cached message lists for this conversation
      queryClient.setQueriesData(
        { queryKey: ["messages", conversationId] },
        (old: any) => {
          if (!old) return { messages: [message] };
          if (Array.isArray(old)) {
            const exists = old.some((m) => (m._id || m.id) === (message._id || message.id));
            if (exists) return old;
            return [...old, message];
          }
          if (Array.isArray(old.messages)) {
            const exists = old.messages.some((m: any) => (m._id || m.id) === (message._id || message.id));
            if (exists) return old;
            return { ...old, messages: [...old.messages, message] };
          }
          if (Array.isArray(old.items)) {
            const exists = old.items.some((m: any) => (m._id || m.id) === (message._id || message.id));
            if (exists) return old;
            return { ...old, items: [...old.items, message] };
          }
          return { ...old, messages: [message] };
        }
      );

      // Update conversation preview and unread count
      let foundInCache = false;
      queryClient.setQueriesData(
        { queryKey: ["conversations"] },
        (old: any) => {
          if (!old?.conversations) return old;
          let targetConv: any = null;
          const remainingConvs = old.conversations.filter((c: any) => {
            if ((c._id || c.id) === conversationId) {
              foundInCache = true;
              targetConv = {
                ...c,
                lastMessageId: message,
                lastMessageAt: message.createdAt || new Date().toISOString(),
                unreadCount: isViewing || !isFromOther ? 0 : (c.unreadCount || 0) + 1,
              };
              return false;
            }
            return true;
          });
          return {
            ...old,
            conversations: targetConv ? [targetConv, ...remainingConvs] : old.conversations,
          };
        }
      );

      // If conversation is brand new for this user, fetch it so sidebar shows it immediately
      if (!foundInCache) {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      }

      // If NOT viewing and from other user, increment global unread count
      if (!isViewing && isFromOther) {
        dispatch(incrementUnreadCount());
        queryClient.setQueryData(["unread-chat-count"], (prev: number | undefined) =>
          typeof prev === "number" ? prev + 1 : 1
        );
      }

      // If actively looking at this conversation, auto mark as read
      if (isViewing && isFromOther) {
        socketInstance.emit("mark_read", { conversationId });
      }
    };

    // 2. Conversation Updated (Handles background message arrives for recipient or preview update for sender)
    const handleConversationUpdated = (data: {
      conversationId: string;
      lastMessage: ChatMessage;
      unreadTotal?: number;
      unreadCount?: number;
    }) => {
      if (typeof data.unreadTotal === "number") {
        dispatch(setUnreadTotalCount(data.unreadTotal));
        queryClient.setQueryData(["unread-chat-count"], data.unreadTotal);
      }

      if (data.conversationId && data.lastMessage) {
        const isViewing = activeConversationIdRef.current === data.conversationId;
        const senderIdStr = getUserIdString(data.lastMessage.senderId);
        const isFromOther = senderIdStr !== currentUserIdRef.current;

        // If viewing this conversation, ensure the message is appended to the active chat window cache
        if (isViewing) {
          queryClient.setQueriesData(
            { queryKey: ["messages", data.conversationId] },
            (old: any) => {
              if (!old) return { messages: [data.lastMessage] };
              if (Array.isArray(old)) {
                const exists = old.some((m) => (m._id || m.id) === (data.lastMessage._id || data.lastMessage.id));
                if (exists) return old;
                return [...old, data.lastMessage];
              }
              if (Array.isArray(old.messages)) {
                const exists = old.messages.some((m: any) => (m._id || m.id) === (data.lastMessage._id || data.lastMessage.id));
                if (exists) return old;
                return { ...old, messages: [...old.messages, data.lastMessage] };
              }
              if (Array.isArray(old.items)) {
                const exists = old.items.some((m: any) => (m._id || m.id) === (data.lastMessage._id || data.lastMessage.id));
                if (exists) return old;
                return { ...old, items: [...old.items, data.lastMessage] };
              }
              return { ...old, messages: [data.lastMessage] };
            }
          );

          if (isFromOther) {
            socketInstance.emit("mark_read", { conversationId: data.conversationId });
          }
        }

        let foundInCache = false;
        queryClient.setQueriesData(
          { queryKey: ["conversations"] },
          (old: any) => {
            if (!old?.conversations) return old;
            let targetConv: any = null;
            const remainingConvs = old.conversations.filter((c: any) => {
              if ((c._id || c.id) === data.conversationId) {
                foundInCache = true;
                const alreadyUpdatedWithMsg =
                  (c.lastMessageId?._id || c.lastMessageId?.id) ===
                  (data.lastMessage._id || data.lastMessage.id);

                let nextUnread = c.unreadCount || 0;
                if (typeof data.unreadCount === "number") {
                  nextUnread = data.unreadCount;
                } else if (isViewing || !isFromOther) {
                  nextUnread = 0;
                } else if (!alreadyUpdatedWithMsg) {
                  nextUnread = (c.unreadCount || 0) + 1;
                }

                targetConv = {
                  ...c,
                  lastMessageId: data.lastMessage,
                  lastMessageAt: data.lastMessage.createdAt || new Date().toISOString(),
                  unreadCount: nextUnread,
                };
                return false;
              }
              return true;
            });

            return {
              ...old,
              conversations: targetConv ? [targetConv, ...remainingConvs] : old.conversations,
            };
          }
        );

        if (!foundInCache) {
          void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        }
      }
    };`;

if (realtime.includes(oldHandlerBlock)) {
  realtime = realtime.replace(oldHandlerBlock, newHandlerBlock);
}

fs.writeFileSync(realtimePath, realtime);
console.log('✅ Updated RealtimeContext.tsx');

// 2. Update useChatSocket.ts
const useChatSocketPath = path.join(clientRoot, 'features/chat/hooks/useChatSocket.ts');
let useChatSocket = fs.readFileSync(useChatSocketPath, 'utf8');

useChatSocket = `import { useEffect, useCallback } from "react";
import useAuth from "@/features/auth/hooks/useAuth";
import { useRealtime } from "@/shared/context/RealtimeContext";

export const useChatSocket = (activeConversationId?: string | null) => {
  const { user } = useAuth();
  const { socket, joinConversation, leaveConversation } = useRealtime();

  const currentUserName = user?.name || (user as any)?.firstName || "User";

  // Effect: Room join/leave ONLY when activeConversationId actually changes
  useEffect(() => {
    if (!activeConversationId) return;

    joinConversation(activeConversationId);

    return () => {
      leaveConversation(activeConversationId);
    };
  }, [activeConversationId]);

  // Outgoing Action Handlers (Shared & Reusable across Components)
  const sendMessage = useCallback(
    (
      conversationId: string,
      messageText: string,
      messageType = "text",
      attachments: Array<{
        url: string;
        name?: string;
        size?: number;
        mimeType?: string;
      }> = []
    ) => {
      if (socket?.connected) {
        socket.emit("send_message", {
          conversationId,
          message: messageText,
          messageType,
          attachments,
        });
      } else {
        console.warn("Chat socket not connected — message not sent over socket");
      }
    },
    [socket]
  );

  const startTyping = useCallback(
    (conversationId: string) => {
      if (socket?.connected) {
        socket.emit("typing_start", {
          conversationId,
          userName: currentUserName,
        });
      }
    },
    [socket, currentUserName]
  );

  const stopTyping = useCallback(
    (conversationId: string) => {
      if (socket?.connected) {
        socket.emit("typing_stop", { conversationId });
      }
    },
    [socket]
  );

  const markAsRead = useCallback(
    (conversationId: string) => {
      if (socket?.connected) {
        socket.emit("mark_read", { conversationId });
      }
    },
    [socket]
  );

  const editMessage = useCallback(
    (conversationId: string, messageId: string, newText: string) => {
      if (socket?.connected) {
        socket.emit("edit_message", {
          conversationId,
          messageId,
          newText,
        });
      }
    },
    [socket]
  );

  const deleteMessage = useCallback(
    (conversationId: string, messageId: string, deleteForEveryone: boolean) => {
      if (socket?.connected) {
        socket.emit("delete_message", {
          conversationId,
          messageId,
          deleteForEveryone,
        });
      }
    },
    [socket]
  );

  return {
    socket,
    sendMessage,
    startTyping,
    stopTyping,
    markAsRead,
    editMessage,
    deleteMessage,
  };
};
`;

fs.writeFileSync(useChatSocketPath, useChatSocket);
console.log('✅ Updated useChatSocket.ts');

// 3. Update ConversationSidebar.tsx for user-namespaced deleted map
const sidebarPath = path.join(clientRoot, 'features/chat/components/ConversationSidebar.tsx');
let sidebar = fs.readFileSync(sidebarPath, 'utf8');

sidebar = sidebar.replace(
  'const key = "jobbox_deleted_convs";',
  'const key = "jobbox_deleted_convs_" + currentUserId;'
);

fs.writeFileSync(sidebarPath, sidebar);
console.log('✅ Updated ConversationSidebar.tsx');

// 4. Update useChat.ts for user-namespaced deleted map
const useChatPath = path.join(clientRoot, 'features/chat/hooks/useChat.ts');
let useChat = fs.readFileSync(useChatPath, 'utf8');

useChat = useChat.replace(
  'const key = "jobbox_deleted_convs";',
  'const key = "jobbox_deleted_convs_" + (user?.id || (user as any)?._id || "");'
);

fs.writeFileSync(useChatPath, useChat);
console.log('✅ Updated useChat.ts');
