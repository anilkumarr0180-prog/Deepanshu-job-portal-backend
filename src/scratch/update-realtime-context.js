const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '../../../client/src');

// 1. Read and update RealtimeContext.tsx
const realtimeContextPath = path.join(clientRoot, 'shared/context/RealtimeContext.tsx');
let realtimeContent = fs.readFileSync(realtimeContextPath, 'utf8');

// Ensure import of CallHistoryItem
if (!realtimeContent.includes('CallHistoryItem')) {
  realtimeContent = realtimeContent.replace(
    'import { type ChatMessage, getUserIdString } from "@/features/chat/types/chat.types";',
    'import { type ChatMessage, getUserIdString } from "@/features/chat/types/chat.types";\nimport type { CallHistoryItem } from "@/features/call/types/call.types";'
  );
}

// Invalidate call history on reconnect
if (!realtimeContent.includes('["call-history"]')) {
  realtimeContent = realtimeContent.replace(
    'void queryClient.invalidateQueries({ queryKey: ["dashboard"] });',
    'void queryClient.invalidateQueries({ queryKey: ["dashboard"] });\n    void queryClient.invalidateQueries({ queryKey: ["call-history"] });\n    void queryClient.invalidateQueries({ queryKey: ["unread-missed-calls-count"] });'
  );
}

// Add socket listeners for call:history_created, call:missed, call:missed_count_updated
const callListenersBlock = `
    // Call History Realtime Sync
    const processedCallHistoryRef = new Set<string>();
    const handleCallHistoryCreated = (data: CallHistoryItem) => {
      if (!data?.callId) return;
      if (processedCallHistoryRef.has(data.callId)) return;
      processedCallHistoryRef.add(data.callId);
      if (processedCallHistoryRef.size > 200) {
        processedCallHistoryRef.clear();
      }

      const convId =
        typeof data.conversationId === "object"
          ? data.conversationId?._id || data.conversationId?.id
          : data.conversationId;

      if (convId) {
        queryClient.setQueriesData(
          { queryKey: ["call-history", convId] },
          (old: { items: CallHistoryItem[]; pagination: any } | undefined) => {
            if (!old) {
              return {
                items: [data],
                pagination: {
                  page: 1,
                  limit: 50,
                  totalItems: 1,
                  totalPages: 1,
                  hasNextPage: false,
                  hasPrevPage: false,
                },
              };
            }
            const exists = old.items?.some((c) => c.callId === data.callId);
            if (exists) return old;
            return {
              ...old,
              items: [...(old.items || []), data],
              pagination: old.pagination
                ? { ...old.pagination, totalItems: (old.pagination.totalItems || 0) + 1 }
                : old.pagination,
            };
          }
        );
      }

      queryClient.setQueriesData(
        { queryKey: ["call-history"] },
        (old: { items: CallHistoryItem[]; pagination: any } | undefined) => {
          if (!old?.items) return old;
          const exists = old.items.some((c) => c.callId === data.callId);
          if (exists) return old;
          return {
            ...old,
            items: [data, ...old.items],
            pagination: old.pagination
              ? { ...old.pagination, totalItems: (old.pagination.totalItems || 0) + 1 }
              : old.pagination,
          };
        }
      );
    };

    const handleCallMissed = (data: CallHistoryItem) => {
      if (!data?.callId) return;
    };

    const handleCallMissedCountUpdated = (data: { unreadMissedCallCount: number }) => {
      if (typeof data.unreadMissedCallCount === "number") {
        queryClient.setQueryData(["unread-missed-calls-count"], data.unreadMissedCallCount);
      }
    };

    socketInstance.on("call:history_created", handleCallHistoryCreated);
    socketInstance.on("call:missed", handleCallMissed);
    socketInstance.on("call:missed_count_updated", handleCallMissedCountUpdated);
`;

if (!realtimeContent.includes('call:history_created')) {
  realtimeContent = realtimeContent.replace(
    'socketInstance.on("user_stop_typing", handleUserStopTyping);',
    'socketInstance.on("user_stop_typing", handleUserStopTyping);\n' + callListenersBlock
  );
}

fs.writeFileSync(realtimeContextPath, realtimeContent);
console.log('✅ Updated RealtimeContext.tsx with call event listeners');
