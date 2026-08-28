const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '../../../client/src');

// 1. Update useChat.ts
const useChatPath = path.join(clientRoot, 'features/chat/hooks/useChat.ts');
let useChatContent = fs.readFileSync(useChatPath, 'utf8');

if (!useChatContent.includes('import type { MessageType } from "../types/chat.types";')) {
  useChatContent = 'import type { MessageType } from "../types/chat.types";\n' + useChatContent;
}

useChatContent = useChatContent.replace(
  'messageType?: "text" | "image" | "file" | "system";',
  'messageType?: MessageType;'
);

fs.writeFileSync(useChatPath, useChatContent);
console.log('✅ Updated useChat.ts with MessageType');

// 2. Create useSendVoiceMessage.ts
const hookPath = path.join(clientRoot, 'features/chat/hooks/useSendVoiceMessage.ts');
const hookContent = `import { useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { useSendMessage } from "./useChat";
import { uploadVoiceAudioToCloudinary } from "../services/voiceUpload.service";
import type { ChatMessage } from "../types/chat.types";

export type SendVoiceState = "idle" | "uploading" | "sending" | "sent" | "error";

export interface SendVoiceOptions {
  conversationId: string;
  blob: Blob;
  duration: number; // in seconds
  mimeType?: string;
}

export interface UseSendVoiceMessageReturn {
  state: SendVoiceState;
  isUploading: boolean;
  isSending: boolean;
  progress: number;
  error: string | null;
  sendVoiceMessage: (options: SendVoiceOptions) => Promise<ChatMessage | null>;
  cancel: () => void;
  reset: () => void;
}

/**
 * useSendVoiceMessage - Orchestrates uploading audio to Cloudinary and creating the Message entity
 */
export function useSendVoiceMessage(): UseSendVoiceMessageReturn {
  const [state, setState] = useState<SendVoiceState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const sendMessageMutation = useSendMessage();

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState("idle");
    setProgress(0);
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setProgress(0);
    setError(null);
  }, []);

  const sendVoiceMessage = useCallback(
    async (options: SendVoiceOptions): Promise<ChatMessage | null> => {
      const { conversationId, blob, duration, mimeType } = options;

      if (!conversationId) {
        const msg = "Conversation ID is required.";
        setError(msg);
        toast.error(msg);
        return null;
      }

      if (!blob || blob.size === 0) {
        const msg = "Cannot send an empty voice message.";
        setError(msg);
        toast.error(msg);
        return null;
      }

      setError(null);
      setState("uploading");
      setProgress(0);

      abortControllerRef.current = new AbortController();

      try {
        // Step 1: Direct Cloudinary Upload
        const uploadResult = await uploadVoiceAudioToCloudinary({
          blob,
          duration,
          mimeType,
          signal: abortControllerRef.current.signal,
          onProgress: (pct) => setProgress(pct),
        });

        // Step 2: Create Message via existing REST mutation
        setState("sending");

        const messagePayload = {
          conversationId,
          message: "🎤 Voice message",
          messageType: "voice" as const,
          attachments: [
            {
              url: uploadResult.url,
              name: uploadResult.originalFilename,
              size: uploadResult.size,
              mimeType: uploadResult.mimeType,
            },
          ],
        };

        const createdMessage = await sendMessageMutation.mutateAsync(messagePayload);

        setState("sent");
        setProgress(100);
        return createdMessage;
      } catch (err: any) {
        setState("error");
        setProgress(0);

        if (err?.name === "CanceledError" || err?.name === "AbortError") {
          setError("Voice message upload was cancelled.");
          return null;
        }

        const errMsg =
          err?.response?.data?.message ||
          err?.message ||
          "Failed to send voice message. Please try again.";

        setError(errMsg);
        toast.error(errMsg);
        return null;
      } finally {
        abortControllerRef.current = null;
      }
    },
    [sendMessageMutation]
  );

  return {
    state,
    isUploading: state === "uploading",
    isSending: state === "sending",
    progress,
    error,
    sendVoiceMessage,
    cancel,
    reset,
  };
}
`;

fs.writeFileSync(hookPath, hookContent);
console.log('✅ Created useSendVoiceMessage.ts');
