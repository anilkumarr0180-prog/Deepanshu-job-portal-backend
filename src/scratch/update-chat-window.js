const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '../../../client/src');
const chatWindowPath = path.join(clientRoot, 'features/chat/components/ChatWindow.tsx');
let chatWindow = fs.readFileSync(chatWindowPath, 'utf8');

// 1. Add imports if not present
if (!chatWindow.includes('useConversationCallHistory')) {
  chatWindow = chatWindow.replace(
    'import { useCall } from "@/features/call/context/CallContext";',
    'import { useCall } from "@/features/call/context/CallContext";\nimport { useConversationCallHistory, useMarkMissedCallsAsRead } from "@/features/call/hooks/useCallHistory";\nimport CallHistoryBubble from "@/features/call/components/CallHistoryBubble";\nimport type { CallHistoryItem } from "@/features/call/types/call.types";'
  );
}

// 2. Add hook usages inside ChatWindow
if (!chatWindow.includes('useConversationCallHistory(conversation?._id')) {
  chatWindow = chatWindow.replace(
    '  const { initiateCall, callState } = useCall();',
    `  const { initiateCall, callState } = useCall();
  const { data: callHistoryData } = useConversationCallHistory(conversation?._id || null);
  const markMissedCalls = useMarkMissedCallsAsRead();

  // Mark missed calls as read when opening conversation
  useEffect(() => {
    if (conversation?._id) {
      markMissedCalls.mutate(conversation._id);
    }
  }, [conversation?._id]);`
  );
}

// 3. Update timelineItems in renderMessages
const targetRenderBlock = `  // Build message list with date headers & grouping
  const renderMessages = () => {
    if (displayedMessages.length === 0) {
      if (searchQuery) {
        return (
          <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400">
            <Search className="h-7 w-7 mb-2 opacity-40" />
            <p className="text-sm font-semibold text-slate-600">No messages matching "{searchQuery}"</p>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center justify-center h-full py-16 space-y-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
            <Briefcase className="h-7 w-7 text-[#3C65F5]" />
          </div>
          <p className="text-sm font-semibold text-slate-700">No messages yet</p>
          <p className="text-xs text-slate-400">Send a message below to start the conversation!</p>
        </div>
      );
    }

    const elements: React.ReactNode[] = [];
    let lastDateStr = "";

    displayedMessages.forEach((msg, idx) => {
      const msgDate = new Date(msg.createdAt);
      const now = new Date();
      const isToday = msgDate.toDateString() === now.toDateString();
      const isYesterday =
        new Date(now.setDate(now.getDate() - 1)).toDateString() === msgDate.toDateString();

      const dateStr = isToday
        ? "Today"
        : isYesterday
        ? "Yesterday"
        : msgDate.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

      if (dateStr !== lastDateStr) {
        lastDateStr = dateStr;
        elements.push(
          <div key={\`date-\${dateStr}\`} className="flex justify-center my-5">
            <span className="rounded-full bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200/70 dark:border-slate-700/60 px-4 py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 shadow-sm">
              {dateStr}
            </span>
          </div>
        );
      }

      const senderIdStr = getUserIdString(msg.senderId);
      const isSelf = senderIdStr === currentUserId;
      const nextMsg = idx < displayedMessages.length - 1 ? displayedMessages[idx + 1] : null;
      const showAvatar = !isSelf && (!nextMsg || !isSameSender(msg, nextMsg));

      elements.push(
        <MessageBubble
          key={msg._id || msg.id || idx}
          message={msg}
          isSelf={isSelf}
          showAvatar={showAvatar}
          senderName={partner?.name}
          senderAvatar={partner?.profilePicture}
          onEditMessage={onEditMessage}
          onDeleteMessage={onDeleteMessage}
        />
      );
    });

    return elements;
  };`;

const replacementRenderBlock = `  // Build unified chronological timeline (messages + call records)
  type TimelineItem =
    | { type: "message"; id: string; timestamp: Date; message: ChatMessage }
    | { type: "call"; id: string; timestamp: Date; call: CallHistoryItem };

  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    displayedMessages.forEach((msg) => {
      items.push({
        type: "message",
        id: msg._id || msg.id || \`msg_\${msg.createdAt}\`,
        timestamp: new Date(msg.createdAt),
        message: msg,
      });
    });

    if (callHistoryData?.items && Array.isArray(callHistoryData.items) && !searchQuery.trim()) {
      callHistoryData.items.forEach((c) => {
        items.push({
          type: "call",
          id: c._id || c.id || c.callId,
          timestamp: new Date(c.startedAt || c.createdAt),
          call: c,
        });
      });
    }

    items.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return items;
  }, [displayedMessages, callHistoryData, searchQuery]);

  // Build message list with date headers & grouping
  const renderMessages = () => {
    if (timelineItems.length === 0) {
      if (searchQuery) {
        return (
          <div className="flex flex-col items-center justify-center h-48 text-center text-slate-400">
            <Search className="h-7 w-7 mb-2 opacity-40" />
            <p className="text-sm font-semibold text-slate-600">No messages matching "{searchQuery}"</p>
          </div>
        );
      }
      return (
        <div className="flex flex-col items-center justify-center h-full py-16 space-y-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-slate-800">
            <Briefcase className="h-7 w-7 text-[#3C65F5]" />
          </div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No activity yet</p>
          <p className="text-xs text-slate-400">Send a message or start a call to begin the conversation!</p>
        </div>
      );
    }

    const elements: React.ReactNode[] = [];
    let lastDateStr = "";

    timelineItems.forEach((item, idx) => {
      const itemDate = item.timestamp;
      const now = new Date();
      const isToday = itemDate.toDateString() === now.toDateString();
      const isYesterday =
        new Date(now.setDate(now.getDate() - 1)).toDateString() === itemDate.toDateString();

      const dateStr = isToday
        ? "Today"
        : isYesterday
        ? "Yesterday"
        : itemDate.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });

      if (dateStr !== lastDateStr) {
        lastDateStr = dateStr;
        elements.push(
          <div key={\`date-\${dateStr}-\${idx}\`} className="flex justify-center my-5">
            <span className="rounded-full bg-white/80 dark:bg-slate-800/90 backdrop-blur-sm border border-slate-200/70 dark:border-slate-700/60 px-4 py-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400 shadow-sm">
              {dateStr}
            </span>
          </div>
        );
      }

      if (item.type === "call") {
        elements.push(
          <CallHistoryBubble
            key={item.id}
            call={item.call}
            currentUserId={currentUserId}
            onCallAgain={handleStartCall}
          />
        );
      } else {
        const msg = item.message;
        const senderIdStr = getUserIdString(msg.senderId);
        const isSelf = senderIdStr === currentUserId;
        const nextItem = idx < timelineItems.length - 1 ? timelineItems[idx + 1] : null;
        const showAvatar =
          !isSelf &&
          (!nextItem ||
            nextItem.type !== "message" ||
            !isSameSender(msg, nextItem.message));

        elements.push(
          <MessageBubble
            key={msg._id || msg.id || idx}
            message={msg}
            isSelf={isSelf}
            showAvatar={showAvatar}
            senderName={partner?.name}
            senderAvatar={partner?.profilePicture}
            onEditMessage={onEditMessage}
            onDeleteMessage={onDeleteMessage}
          />
        );
      }
    });

    return elements;
  };`;

if (chatWindow.includes(targetRenderBlock)) {
  chatWindow = chatWindow.replace(targetRenderBlock, replacementRenderBlock);
}

fs.writeFileSync(chatWindowPath, chatWindow);
console.log('✅ Updated ChatWindow.tsx with timeline rendering and CallHistoryBubble');
