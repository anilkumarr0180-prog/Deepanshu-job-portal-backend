const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '../../../client/src');
const chatWindowPath = path.join(clientRoot, 'features/chat/components/ChatWindow.tsx');
let chatWindow = fs.readFileSync(chatWindowPath, 'utf8');

// Define timelineItems block
const timelineItemsBlock = `  // Build unified chronological timeline (messages + call records)
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
  }, [displayedMessages, callHistoryData, searchQuery]);`;

// Remove from renderMessages
chatWindow = chatWindow.replace(timelineItemsBlock, '');

// Place right after displayedMessages useMemo (before if (!conversation))
chatWindow = chatWindow.replace(
  `  // Filter messages when searching (declared before early return to respect React rules of hooks)
  const displayedMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter((m) => m.message?.toLowerCase().includes(q));
  }, [messages, searchQuery]);`,
  `  // Filter messages when searching (declared before early return to respect React rules of hooks)
  const displayedMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const q = searchQuery.toLowerCase();
    return messages.filter((m) => m.message?.toLowerCase().includes(q));
  }, [messages, searchQuery]);\n\n${timelineItemsBlock}`
);

fs.writeFileSync(chatWindowPath, chatWindow);
console.log('✅ Fixed React hooks order in ChatWindow.tsx');
