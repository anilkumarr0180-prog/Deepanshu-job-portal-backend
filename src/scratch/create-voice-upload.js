const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '../../../client/src');

// 1. Create voiceUpload.service.ts
const servicePath = path.join(clientRoot, 'features/chat/services/voiceUpload.service.ts');
fs.mkdirSync(path.dirname(servicePath), { recursive: true });
const serviceContent = `import axios from "axios";
import { getUploadSignature } from "@/shared/api/upload.api";

export interface VoiceUploadResult {
  url: string;
  publicId: string;
  mimeType: string;
  size: number;
  duration: number;
  originalFilename: string;
}

export interface UploadVoiceOptions {
  blob: Blob;
  mimeType?: string;
  duration?: number;
  signal?: AbortSignal;
  onProgress?: (percent: number) => void;
}

const MAX_VOICE_SIZE = 5 * 1024 * 1024; // 5 MB

/**
 * Derives safe deterministic audio file extension from MIME type
 */
export const getAudioExtension = (mimeType: string): string => {
  const lower = (mimeType || "").toLowerCase();
  if (lower.includes("mp4") || lower.includes("m4a") || lower.includes("aac")) {
    return "mp4";
  }
  if (lower.includes("ogg")) {
    return "ogg";
  }
  if (lower.includes("mp3") || lower.includes("mpeg")) {
    return "mp3";
  }
  if (lower.includes("wav")) {
    return "wav";
  }
  return "webm";
};

/**
 * Direct authenticated client-to-Cloudinary upload for recorded voice audio blobs
 */
export async function uploadVoiceAudioToCloudinary(
  options: UploadVoiceOptions
): Promise<VoiceUploadResult> {
  const {
    blob,
    mimeType = blob.type || "audio/webm",
    duration = 0,
    signal,
    onProgress,
  } = options;

  // 1. Client-side size validation guard
  if (blob.size > MAX_VOICE_SIZE) {
    throw new Error("Voice recording exceeds maximum limit of 5MB.");
  }

  if (blob.size === 0) {
    throw new Error("Cannot upload an empty audio recording.");
  }

  // 2. Safe deterministic filename
  const extension = getAudioExtension(mimeType);
  const filename = \`voice_\${Date.now()}.\${extension}\`;
  const file = new File([blob], filename, { type: mimeType });

  // 3. Request short-lived upload signature from backend for "chat-media"
  const sig = await getUploadSignature("chat-media");

  // 4. Cloudinary video/audio upload endpoint (Cloudinary stores audio under the 'video' resource type)
  const cloudinaryUrl = \`https://api.cloudinary.com/v1_1/\${sig.cloudName}/video/upload\`;

  // 5. Build FormData payload
  const formData = new FormData();
  formData.append("file", file);
  formData.append("api_key", sig.apiKey);
  formData.append("timestamp", String(sig.timestamp));
  formData.append("signature", sig.signature);
  if (sig.folder) {
    formData.append("folder", sig.folder);
  }
  if (sig.uploadPreset) {
    formData.append("upload_preset", sig.uploadPreset);
  }

  // 6. Direct upload with progress tracking and cancellation support
  const response = await axios.post<{
    secure_url: string;
    public_id: string;
    bytes?: number;
    format?: string;
  }>(cloudinaryUrl, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    signal,
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percent);
      }
    },
  });

  return {
    url: response.data.secure_url,
    publicId: response.data.public_id,
    mimeType,
    size: response.data.bytes || blob.size,
    duration,
    originalFilename: filename,
  };
}
`;

fs.writeFileSync(servicePath, serviceContent);
console.log('✅ Created features/chat/services/voiceUpload.service.ts');

// 2. Create useVoiceUpload.ts
const hookPath = path.join(clientRoot, 'features/chat/hooks/useVoiceUpload.ts');
const hookContent = `import { useState, useRef, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import {
  uploadVoiceAudioToCloudinary,
  type VoiceUploadResult,
} from "../services/voiceUpload.service";

export interface UseVoiceUploadReturn {
  uploadVoice: (
    blob: Blob,
    duration: number,
    mimeType?: string
  ) => Promise<VoiceUploadResult | null>;
  cancelUpload: () => void;
  isUploading: boolean;
  progress: number;
  error: string | null;
  reset: () => void;
}

/**
 * useVoiceUpload - React hook for uploading voice messages to Cloudinary with progress & cancellation
 */
export function useVoiceUpload(): UseVoiceUploadReturn {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const uploadVoice = useCallback(
    async (
      blob: Blob,
      duration: number,
      mimeType?: string
    ): Promise<VoiceUploadResult | null> => {
      setIsUploading(true);
      setProgress(0);
      setError(null);

      abortControllerRef.current = new AbortController();

      try {
        const result = await uploadVoiceAudioToCloudinary({
          blob,
          duration,
          mimeType,
          signal: abortControllerRef.current.signal,
          onProgress: (percent) => setProgress(percent),
        });

        setIsUploading(false);
        setProgress(100);
        return result;
      } catch (err: unknown) {
        setIsUploading(false);
        setProgress(0);

        if (axios.isCancel(err) || (err as any)?.name === "CanceledError" || (err as any)?.name === "AbortError") {
          setError("Upload was cancelled.");
          return null;
        }

        let errorMessage = "Voice message upload failed. Please try again.";
        const axiosErr = err as any;
        if (axiosErr?.response?.data?.error?.message) {
          errorMessage = axiosErr.response.data.error.message;
        } else if (axiosErr?.response?.data?.message) {
          errorMessage = axiosErr.response.data.message;
        } else if (axiosErr?.message) {
          errorMessage = axiosErr.message;
        }

        setError(errorMessage);
        toast.error(errorMessage);
        return null;
      } finally {
        abortControllerRef.current = null;
      }
    },
    []
  );

  const cancelUpload = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsUploading(false);
      setProgress(0);
    }
  }, []);

  const reset = useCallback(() => {
    setIsUploading(false);
    setProgress(0);
    setError(null);
  }, []);

  return {
    uploadVoice,
    cancelUpload,
    isUploading,
    progress,
    error,
    reset,
  };
}
`;

fs.writeFileSync(hookPath, hookContent);
console.log('✅ Created features/chat/hooks/useVoiceUpload.ts');
