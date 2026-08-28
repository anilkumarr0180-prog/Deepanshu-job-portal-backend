const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '../../../client/src');
console.log('Client Root:', clientRoot);

// 1. Update client/src/features/call/types/call.types.ts
const callTypesContent = `export type CallState =
  | "IDLE"
  | "CALLING" // Outgoing: waiting for callee to receive & answer
  | "RINGING" // Incoming: received incoming call invitation
  | "ACCEPTED" // Accepted by callee, negotiating / preparing
  | "CONNECTING" // WebRTC negotiation in progress
  | "CONNECTED" // Call active
  | "DECLINED" // Rejected by callee
  | "CANCELLED" // Cancelled by caller before answer
  | "MISSED" // Ringing timed out
  | "BUSY" // Target user is already in another call
  | "FAILED" // Error or failure
  | "ENDED"; // Call finished

export interface CallUser {
  id: string;
  _id?: string;
  name?: string;
  profilePicture?: string;
  role?: string;
}

export interface ActiveCallData {
  callId: string;
  conversationId: string;
  remoteUser: CallUser;
  isOutgoing: boolean;
  startedAt?: Date;
  acceptedAt?: Date;
}

export interface CallHistoryItem {
  _id: string;
  id?: string;
  callId: string;
  conversationId: string | { _id: string; id?: string };
  callerId: CallUser | string;
  receiverId: CallUser | string;
  status:
    | "ringing"
    | "accepted"
    | "ended"
    | "cancelled"
    | "declined"
    | "busy"
    | "missed"
    | "failed";
  startedAt: string;
  answeredAt?: string | null;
  endedAt?: string | null;
  durationSeconds: number;
  endReason?: string;
  isMissedCallRead?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface CallHistoryPagination {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface CallHistoryResponse {
  items: CallHistoryItem[];
  pagination: CallHistoryPagination;
}

export interface CallMissedCountPayload {
  unreadMissedCallCount: number;
}
`;

fs.writeFileSync(path.join(clientRoot, 'features/call/types/call.types.ts'), callTypesContent);
console.log('✅ Updated features/call/types/call.types.ts');

// 2. Update client/src/features/call/api/call.api.ts
const callApiContent = `import { axiosInstance } from "@/lib/axios";
import type {
  CallHistoryResponse,
} from "../types/call.types";

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface IceServersResponse {
  iceServers: IceServerConfig[];
  ttlSeconds?: number;
}

export const fetchIceServersApi = async (): Promise<IceServerConfig[]> => {
  try {
    const response = await axiosInstance.get<{
      success: boolean;
      data: IceServersResponse;
    }>("/call/ice-servers");

    if (response.data?.data?.iceServers && Array.isArray(response.data.data.iceServers)) {
      return response.data.data.iceServers;
    }
  } catch (error) {
    console.warn("Failed to fetch dynamic STUN/TURN servers from backend, falling back to default STUN:", error);
  }

  // Graceful fallback to default Google STUN
  return [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ];
};

export const fetchCallHistoryApi = async (params?: {
  page?: number;
  limit?: number;
  conversationId?: string;
  status?: string;
}): Promise<CallHistoryResponse> => {
  const response = await axiosInstance.get<{
    success: boolean;
    data: CallHistoryResponse;
  }>("/call/history", { params });
  return response.data.data;
};

export const fetchConversationCallHistoryApi = async (
  conversationId: string,
  params?: { page?: number; limit?: number; status?: string }
): Promise<CallHistoryResponse> => {
  const response = await axiosInstance.get<{
    success: boolean;
    data: CallHistoryResponse;
  }>(\`/call/conversation/\${conversationId}\`, { params });
  return response.data.data;
};

export const fetchUnreadMissedCallsCountApi = async (): Promise<number> => {
  const response = await axiosInstance.get<{
    success: boolean;
    data: { unreadCount: number };
  }>("/call/missed/unread-count");
  return response.data?.data?.unreadCount || 0;
};

export const markMissedCallsAsReadApi = async (
  conversationId?: string
): Promise<{ updatedCount: number }> => {
  const response = await axiosInstance.patch<{
    success: boolean;
    data: { updatedCount: number };
  }>("/call/missed/read", { conversationId });
  return response.data.data;
};
`;

fs.writeFileSync(path.join(clientRoot, 'features/call/api/call.api.ts'), callApiContent);
console.log('✅ Updated features/call/api/call.api.ts');

// 3. Create client/src/features/call/hooks/useCallHistory.ts
const callHooksDir = path.join(clientRoot, 'features/call/hooks');
if (!fs.existsSync(callHooksDir)) {
  fs.mkdirSync(callHooksDir, { recursive: true });
}

const useCallHistoryContent = `import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchCallHistoryApi,
  fetchConversationCallHistoryApi,
  fetchUnreadMissedCallsCountApi,
  markMissedCallsAsReadApi,
} from "../api/call.api";

export const useCallHistory = (params?: {
  page?: number;
  limit?: number;
  conversationId?: string;
  status?: string;
}) => {
  return useQuery({
    queryKey: ["call-history", params],
    queryFn: () => fetchCallHistoryApi(params),
    staleTime: 1000 * 30, // 30 seconds
  });
};

export const useConversationCallHistory = (
  conversationId?: string | null,
  params?: { page?: number; limit?: number; status?: string }
) => {
  return useQuery({
    queryKey: ["call-history", conversationId, params],
    queryFn: () =>
      conversationId
        ? fetchConversationCallHistoryApi(conversationId, params)
        : { items: [], pagination: { page: 1, limit: 50, totalItems: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false } },
    enabled: Boolean(conversationId),
    staleTime: 1000 * 30,
  });
};

export const useUnreadMissedCallsCount = () => {
  return useQuery({
    queryKey: ["unread-missed-calls-count"],
    queryFn: fetchUnreadMissedCallsCountApi,
    staleTime: 1000 * 60, // 1 minute
  });
};

export const useMarkMissedCallsAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conversationId?: string) => markMissedCallsAsReadApi(conversationId),
    onSuccess: () => {
      queryClient.setQueryData(["unread-missed-calls-count"], 0);
      queryClient.invalidateQueries({ queryKey: ["call-history"] });
    },
  });
};
`;

fs.writeFileSync(path.join(clientRoot, 'features/call/hooks/useCallHistory.ts'), useCallHistoryContent);
console.log('✅ Created features/call/hooks/useCallHistory.ts');

// 4. Create client/src/features/call/components/CallHistoryBubble.tsx
const callHistoryBubbleContent = `import React from "react";
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneOff,
  AlertTriangle,
  Phone,
} from "lucide-react";
import type { CallHistoryItem } from "../types/call.types";
import { getUserIdString } from "@/features/chat/types/chat.types";

interface CallHistoryBubbleProps {
  call: CallHistoryItem;
  currentUserId: string;
  onCallAgain?: () => void;
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return \`\${hrs}:\${remMins.toString().padStart(2, "0")}:\${secs.toString().padStart(2, "0")}\`;
  }
  return \`\${mins.toString().padStart(2, "0")}:\${secs.toString().padStart(2, "0")}\`;
}

export default function CallHistoryBubble({
  call,
  currentUserId,
  onCallAgain,
}: CallHistoryBubbleProps) {
  const callerIdStr = getUserIdString(call.callerId);
  const isOutgoing = callerIdStr === currentUserId;

  const timestamp = new Date(call.startedAt || call.createdAt).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  const durationStr = formatDuration(call.durationSeconds);

  // Status Presentation configuration
  let label = "Audio call";
  let icon = <Phone className="h-4 w-4" />;
  let badgeStyle =
    "bg-slate-100 dark:bg-slate-800/90 border-slate-200/80 dark:border-slate-700/70 text-slate-700 dark:text-slate-300";
  let iconStyle = "text-slate-500 dark:text-slate-400";

  if (call.status === "ended") {
    if (isOutgoing) {
      label = "Outgoing audio call";
      icon = <PhoneOutgoing className="h-4 w-4" />;
      iconStyle = "text-emerald-600 dark:text-emerald-400";
      badgeStyle =
        "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-300";
    } else {
      label = "Incoming audio call";
      icon = <PhoneIncoming className="h-4 w-4" />;
      iconStyle = "text-emerald-600 dark:text-emerald-400";
      badgeStyle =
        "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-300";
    }
  } else if (call.status === "missed") {
    if (isOutgoing) {
      label = "Unanswered call";
      icon = <PhoneOff className="h-4 w-4" />;
      iconStyle = "text-slate-500 dark:text-slate-400";
    } else {
      label = "Missed audio call";
      icon = <PhoneMissed className="h-4 w-4" />;
      iconStyle = "text-rose-600 dark:text-rose-400";
      badgeStyle =
        "bg-rose-50/80 dark:bg-rose-950/30 border-rose-200/80 dark:border-rose-800/50 text-rose-900 dark:text-rose-200 font-semibold shadow-2xs";
    }
  } else if (call.status === "declined") {
    label = isOutgoing ? "Call declined" : "Declined call";
    icon = <PhoneOff className="h-4 w-4" />;
    iconStyle = "text-rose-500 dark:text-rose-400";
  } else if (call.status === "cancelled") {
    label = "Cancelled call";
    icon = <PhoneOff className="h-4 w-4" />;
    iconStyle = "text-slate-400 dark:text-slate-500";
  } else if (call.status === "busy") {
    label = isOutgoing ? "Call declined — user busy" : "Missed call (Busy)";
    icon = <PhoneOff className="h-4 w-4" />;
    iconStyle = "text-amber-500 dark:text-amber-400";
  } else if (call.status === "failed") {
    label = "Call connection failed";
    icon = <AlertTriangle className="h-4 w-4" />;
    iconStyle = "text-amber-500 dark:text-amber-400";
  }

  return (
    <div className="flex justify-center my-3.5 px-4" role="status" aria-label={\`\${label} at \${timestamp}\`}>
      <div
        className={\`group flex items-center justify-between gap-3 max-w-sm w-full sm:w-auto rounded-2xl border px-4 py-2.5 shadow-2xs backdrop-blur-xs transition-all duration-200 hover:shadow-xs \${badgeStyle}\`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={\`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/80 dark:bg-slate-900/80 border border-black/5 dark:border-white/10 shadow-2xs \${iconStyle}\`}
          >
            {icon}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium truncate">{label}</span>
              {durationStr && (
                <span className="text-[11px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                  {durationStr}
                </span>
              )}
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-400 tabular-nums">
              {timestamp}
            </div>
          </div>
        </div>

        {/* Call Again Action Button */}
        {onCallAgain && (
          <button
            type="button"
            onClick={onCallAgain}
            aria-label="Call again"
            title="Call again"
            className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-[#3C65F5] dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-500/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 border border-blue-200/60 dark:border-blue-500/20 rounded-lg px-2.5 py-1 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <Phone className="h-3 w-3" />
            <span className="hidden xs:inline">Call again</span>
          </button>
        )}
      </div>
    </div>
  );
}
`;

fs.writeFileSync(path.join(clientRoot, 'features/call/components/CallHistoryBubble.tsx'), callHistoryBubbleContent);
console.log('✅ Created features/call/components/CallHistoryBubble.tsx');
