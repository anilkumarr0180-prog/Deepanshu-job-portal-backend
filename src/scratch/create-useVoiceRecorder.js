const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '../../../client/src');
const hookFilePath = path.join(clientRoot, 'features/chat/hooks/useVoiceRecorder.ts');

const hookContent = `import { useState, useRef, useCallback, useEffect } from "react";
import { useCall } from "@/features/call/context/CallContext";

export type VoiceRecorderStatus =
  | "idle"
  | "recording"
  | "stopping"
  | "completed"
  | "error";

export interface VoiceRecordingData {
  blob: Blob;
  url: string;
  mimeType: string;
  size: number;
  duration: number; // in seconds
}

export interface UseVoiceRecorderOptions {
  maxDurationSeconds?: number; // default 300s (5 minutes)
  onRecordingComplete?: (data: VoiceRecordingData) => void;
  onError?: (errorMsg: string) => void;
}

export interface UseVoiceRecorderReturn {
  status: VoiceRecorderStatus;
  isRecording: boolean;
  isStopping: boolean;
  isCompleted: boolean;
  duration: number; // in seconds
  formattedDuration: string; // "00:00"
  recordingData: VoiceRecordingData | null;
  audioBlob: Blob | null;
  audioUrl: string | null;
  audioMimeType: string | null;
  audioSize: number | null;
  error: string | null;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<VoiceRecordingData | null>;
  cancelRecording: () => void;
  resetRecording: () => void;
}

/**
 * Supported MIME type negotiation in preference order
 */
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/aac",
];

export const getSupportedAudioMimeType = (): string => {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return "";
  }
  for (const mime of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mime)) {
      return mime;
    }
  }
  return "";
};

/**
 * Maps standard browser DOMExceptions to friendly user messages
 */
export const classifyAudioRecordingError = (err: unknown): string => {
  if (!err || typeof err !== "object") {
    return "Unable to access microphone.";
  }
  const error = err as { name?: string; message?: string };
  switch (error.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "Microphone permission was denied. Please allow microphone access in your browser.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No compatible microphone device was found on your system.";
    case "NotReadableError":
    case "TrackStartError":
      return "Microphone is currently in use by another application.";
    case "OverconstrainedError":
      return "Microphone constraints could not be satisfied.";
    case "SecurityError":
      return "Microphone access is restricted by security policy.";
    default:
      return error.message || "An error occurred while accessing the microphone.";
  }
};

/**
 * Formats seconds into mm:ss
 */
export const formatAudioDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return \`\${mins.toString().padStart(2, "0")}:\${secs.toString().padStart(2, "0")}\`;
};

/**
 * Accurately extracts duration from an audio Blob using HTML5 Audio metadata
 */
export const getAudioBlobDuration = async (blob: Blob): Promise<number> => {
  return new Promise((resolve) => {
    try {
      const audio = document.createElement("audio");
      const objectUrl = URL.createObjectURL(blob);
      audio.src = objectUrl;
      audio.preload = "metadata";

      const cleanup = () => {
        audio.removeEventListener("loadedmetadata", onMetadata);
        audio.removeEventListener("error", onError);
        URL.revokeObjectURL(objectUrl);
      };

      const onMetadata = () => {
        const duration = isFinite(audio.duration) ? audio.duration : 0;
        cleanup();
        resolve(Math.round(duration * 10) / 10);
      };

      const onError = () => {
        cleanup();
        resolve(0);
      };

      audio.addEventListener("loadedmetadata", onMetadata);
      audio.addEventListener("error", onError);

      // Fallback timeout in case metadata event stalls
      setTimeout(() => {
        cleanup();
        resolve(0);
      }, 2000);
    } catch {
      resolve(0);
    }
  });
};

/**
 * useVoiceRecorder - Production-grade MediaRecorder hook for JobBox Voice Messages
 */
export function useVoiceRecorder(
  options: UseVoiceRecorderOptions = {}
): UseVoiceRecorderReturn {
  const { maxDurationSeconds = 300, onRecordingComplete, onError } = options;

  // Safe WebRTC active call detection
  let isCallActive = false;
  try {
    const callCtx = useCall();
    isCallActive = Boolean(
      callCtx &&
      callCtx.callState &&
      callCtx.callState !== "IDLE" &&
      callCtx.callState !== "ENDED" &&
      callCtx.callState !== "FAILED"
    );
  } catch {
    // If rendered outside CallProvider, proceed normally
    isCallActive = false;
  }

  const [status, setStatus] = useState<VoiceRecorderStatus>("idle");
  const [duration, setDuration] = useState<number>(0);
  const [recordingData, setRecordingData] = useState<VoiceRecordingData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxDurationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedMimeTypeRef = useRef<string>("");
  const durationRef = useRef<number>(0);
  const activeBlobUrlRef = useRef<string | null>(null);

  // Stop and release microphone hardware tracks
  const cleanupMediaStream = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      mediaStreamRef.current = null;
    }
  }, []);

  // Clear all running timers
  const clearTimers = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (maxDurationTimeoutRef.current) {
      clearTimeout(maxDurationTimeoutRef.current);
      maxDurationTimeoutRef.current = null;
    }
  }, []);

  // Clean up object URL when replacing or unmounting
  const cleanupActiveBlobUrl = useCallback(() => {
    if (activeBlobUrlRef.current) {
      URL.revokeObjectURL(activeBlobUrlRef.current);
      activeBlobUrlRef.current = null;
    }
  }, []);

  // Stop recording
  const stopRecording = useCallback(async (): Promise<VoiceRecordingData | null> => {
    if (status !== "recording" || !mediaRecorderRef.current) {
      return null;
    }

    setStatus("stopping");
    clearTimers();

    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) {
        setStatus("idle");
        resolve(null);
        return;
      }

      recorder.onstop = async () => {
        try {
          const mimeType = selectedMimeTypeRef.current || recorder.mimeType || "audio/webm";
          const blob = new Blob(chunksRef.current, { type: mimeType });
          
          cleanupActiveBlobUrl();
          const blobUrl = URL.createObjectURL(blob);
          activeBlobUrlRef.current = blobUrl;

          // Attempt precise audio duration calculation with timer fallback
          let calculatedDuration = await getAudioBlobDuration(blob);
          if (!calculatedDuration || calculatedDuration <= 0) {
            calculatedDuration = durationRef.current;
          }

          const result: VoiceRecordingData = {
            blob,
            url: blobUrl,
            mimeType,
            size: blob.size,
            duration: calculatedDuration,
          };

          setRecordingData(result);
          setStatus("completed");
          onRecordingComplete?.(result);
          resolve(result);
        } catch (err: unknown) {
          const msg = "Failed to process recorded audio.";
          setError(msg);
          setStatus("error");
          onError?.(msg);
          resolve(null);
        } finally {
          cleanupMediaStream();
          mediaRecorderRef.current = null;
        }
      };

      try {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      } catch {
        cleanupMediaStream();
        setStatus("error");
        resolve(null);
      }
    });
  }, [status, clearTimers, cleanupActiveBlobUrl, cleanupMediaStream, onRecordingComplete, onError]);

  // Cancel recording and discard data
  const cancelRecording = useCallback(() => {
    clearTimers();
    if (mediaRecorderRef.current) {
      // Detach onstop handler so no completed event fires
      mediaRecorderRef.current.onstop = null;
      try {
        if (mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      mediaRecorderRef.current = null;
    }
    cleanupMediaStream();
    cleanupActiveBlobUrl();
    chunksRef.current = [];
    durationRef.current = 0;
    setDuration(0);
    setRecordingData(null);
    setError(null);
    setStatus("idle");
  }, [clearTimers, cleanupMediaStream, cleanupActiveBlobUrl]);

  // Reset to idle
  const resetRecording = useCallback(() => {
    cancelRecording();
  }, [cancelRecording]);

  // Start recording
  const startRecording = useCallback(async (): Promise<boolean> => {
    // 1. Double-action safeguard
    if (status === "recording") {
      return true;
    }

    // 2. WebRTC active call conflict safeguard
    if (isCallActive) {
      const msg = "Cannot record voice message while a call is active.";
      setError(msg);
      setStatus("error");
      onError?.(msg);
      return false;
    }

    // 3. Browser support check
    if (
      typeof window === "undefined" ||
      !navigator?.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      const msg = "Voice recording is not supported in this browser.";
      setError(msg);
      setStatus("error");
      onError?.(msg);
      return false;
    }

    // Reset previous recording state
    cleanupActiveBlobUrl();
    chunksRef.current = [];
    durationRef.current = 0;
    setDuration(0);
    setRecordingData(null);
    setError(null);

    try {
      // 4. Request microphone access on explicit user intent
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      // 5. Negotiate optimal MIME type
      const mimeType = getSupportedAudioMimeType();
      selectedMimeTypeRef.current = mimeType;

      const recorderOptions: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(stream, recorderOptions);
      mediaRecorderRef.current = recorder;

      // 6. Hook data chunks
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      // 7. Hook recorder errors
      recorder.onerror = () => {
        cleanupMediaStream();
        clearTimers();
        const msg = "MediaRecorder encountered an unexpected error.";
        setError(msg);
        setStatus("error");
        onError?.(msg);
      };

      // 8. Hook start event & timer
      recorder.onstart = () => {
        setStatus("recording");
        const startTime = Date.now();

        timerIntervalRef.current = setInterval(() => {
          const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
          durationRef.current = elapsedSeconds;
          setDuration(elapsedSeconds);
        }, 500);

        // 9. Auto-stop at max duration
        maxDurationTimeoutRef.current = setTimeout(() => {
          void stopRecording();
        }, maxDurationSeconds * 1000);
      };

      // Start recording with 100ms slices for smooth chunk collection
      recorder.start(100);
      return true;
    } catch (err: unknown) {
      cleanupMediaStream();
      clearTimers();
      const friendlyError = classifyAudioRecordingError(err);
      setError(friendlyError);
      setStatus("error");
      onError?.(friendlyError);
      return false;
    }
  }, [
    status,
    isCallActive,
    maxDurationSeconds,
    cleanupActiveBlobUrl,
    cleanupMediaStream,
    clearTimers,
    stopRecording,
    onError,
  ]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      clearTimers();
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      cleanupMediaStream();
      cleanupActiveBlobUrl();
    };
  }, [clearTimers, cleanupMediaStream, cleanupActiveBlobUrl]);

  return {
    status,
    isRecording: status === "recording",
    isStopping: status === "stopping",
    isCompleted: status === "completed",
    duration,
    formattedDuration: formatAudioDuration(duration),
    recordingData,
    audioBlob: recordingData?.blob || null,
    audioUrl: recordingData?.url || null,
    audioMimeType: recordingData?.mimeType || null,
    audioSize: recordingData?.size || null,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    resetRecording,
  };
}
`;

fs.writeFileSync(hookFilePath, hookContent);
console.log('✅ Created client/src/features/chat/hooks/useVoiceRecorder.ts');
