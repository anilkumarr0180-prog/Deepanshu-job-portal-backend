const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '../../../client/src');

const callDiagnosticsContent = `/**
 * Client-Side WebRTC Call Diagnostics & Timing Metrics
 * Captures connection lifecycle, candidate types, state transitions, and classifies failures safely.
 */

export type CallFailureCategory =
  | "SIGNALING_ERROR"
  | "MEDIA_PERMISSION_ERROR"
  | "MEDIA_DEVICE_ERROR"
  | "SDP_ERROR"
  | "ICE_ERROR"
  | "WEBRTC_CONNECTION_ERROR"
  | "TIMEOUT"
  | "REMOTE_HANGUP"
  | "LOCAL_HANGUP"
  | "SOCKET_DISCONNECT"
  | "UNKNOWN";

export type IceCandidateType = "host" | "srflx" | "prflx" | "relay";

export interface CallTimingMetrics {
  initiatedAt?: number;
  acceptedAt?: number;
  connectionStartAt?: number;
  connectedAt?: number;
  endedAt?: number;
  timeToAcceptMs?: number;
  timeToConnectMs?: number;
  durationSeconds?: number;
}

export interface CallDiagnosticsSummary {
  callId: string;
  role: "caller" | "callee";
  candidateTypes: Set<IceCandidateType>;
  connectionStateTransitions: string[];
  iceStateTransitions: string[];
  iceGatheringTransitions: string[];
  signalingTransitions: string[];
  finalConnectionState: string;
  finalIceState: string;
  failureCategory?: CallFailureCategory;
  failureReason?: string;
  timings: CallTimingMetrics;
}

export class CallDiagnosticsSession {
  public summary: CallDiagnosticsSummary;

  constructor(callId: string, role: "caller" | "callee") {
    this.summary = {
      callId,
      role,
      candidateTypes: new Set<IceCandidateType>(),
      connectionStateTransitions: [],
      iceStateTransitions: [],
      iceGatheringTransitions: [],
      signalingTransitions: [],
      finalConnectionState: "new",
      finalIceState: "new",
      timings: {},
    };
  }

  recordInitiated(): void {
    this.summary.timings.initiatedAt = Date.now();
    this.logDebug("initiated");
  }

  recordAccepted(): void {
    const now = Date.now();
    this.summary.timings.acceptedAt = now;
    if (this.summary.timings.initiatedAt) {
      this.summary.timings.timeToAcceptMs = now - this.summary.timings.initiatedAt;
    }
    this.logDebug("accepted (timeToAccept: " + (this.summary.timings.timeToAcceptMs || 0) + "ms)");
  }

  recordConnectionStart(): void {
    this.summary.timings.connectionStartAt = Date.now();
    this.logDebug("connection starting");
  }

  recordConnected(): void {
    const now = Date.now();
    this.summary.timings.connectedAt = now;
    const start = this.summary.timings.connectionStartAt || this.summary.timings.acceptedAt;
    if (start) {
      this.summary.timings.timeToConnectMs = now - start;
    }
    this.logDebug("WebRTC connected (timeToConnect: " + (this.summary.timings.timeToConnectMs || 0) + "ms)");
  }

  recordEnded(): void {
    const now = Date.now();
    this.summary.timings.endedAt = now;
    if (this.summary.timings.connectedAt) {
      this.summary.timings.durationSeconds = Math.max(
        0,
        Math.floor((now - this.summary.timings.connectedAt) / 1000)
      );
    }
    this.logSummary();
  }

  recordConnectionState(state: string): void {
    this.summary.finalConnectionState = state;
    this.summary.connectionStateTransitions.push(state + " @ " + Date.now());
    this.logDebug("connectionState -> " + state);
  }

  recordIceState(state: string): void {
    this.summary.finalIceState = state;
    this.summary.iceStateTransitions.push(state + " @ " + Date.now());
    this.logDebug("iceConnectionState -> " + state);
  }

  recordIceGatheringState(state: string): void {
    this.summary.iceGatheringTransitions.push(state + " @ " + Date.now());
    this.logDebug("iceGatheringState -> " + state);
  }

  recordSignalingState(state: string): void {
    this.summary.signalingTransitions.push(state + " @ " + Date.now());
    this.logDebug("signalingState -> " + state);
  }

  recordCandidate(candidateStr?: string): void {
    if (!candidateStr) return;
    const match = candidateStr.match(/typ\\s+(host|srflx|prflx|relay)/i);
    if (match && match[1]) {
      const type = match[1].toLowerCase() as IceCandidateType;
      this.summary.candidateTypes.add(type);
      this.logDebug("ICE candidate discovered: [" + type + "]");
    }
  }

  recordFailure(category: CallFailureCategory, reason?: string): void {
    this.summary.failureCategory = category;
    this.summary.failureReason = reason;
    this.logSummary();
  }

  private isDebugEnabled(): boolean {
    if (typeof window !== "undefined" && (window as any).__JOBBOX_CALL_DEBUG__) {
      return true;
    }
    return import.meta.env.DEV;
  }

  private logDebug(msg: string): void {
    if (this.isDebugEnabled()) {
      console.log("[CALL " + this.summary.callId + "] " + msg);
    }
  }

  private logSummary(): void {
    if (this.isDebugEnabled()) {
      console.groupCollapsed("[CALL " + this.summary.callId + "] Final Diagnostics Summary");
      console.log("Role:", this.summary.role);
      console.log("Candidate Types:", Array.from(this.summary.candidateTypes));
      console.log("Final Connection State:", this.summary.finalConnectionState);
      console.log("Final ICE State:", this.summary.finalIceState);
      console.log("Timings:", this.summary.timings);
      if (this.summary.failureCategory) {
        console.warn("Failure Category:", this.summary.failureCategory);
        console.warn("Failure Reason:", this.summary.failureReason);
      }
      console.groupEnd();
    }
  }
}

/**
 * Classify browser media or WebRTC error into safe standard category
 */
export function classifyMediaError(err: any): { category: CallFailureCategory; userMessage: string } {
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
    return {
      category: "MEDIA_PERMISSION_ERROR",
      userMessage: "Microphone permission was denied. Please allow microphone access in your browser.",
    };
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
    return {
      category: "MEDIA_DEVICE_ERROR",
      userMessage: "No compatible microphone device was found on your system.",
    };
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return {
      category: "MEDIA_DEVICE_ERROR",
      userMessage: "Microphone is currently in use by another application.",
    };
  }
  return {
    category: "UNKNOWN",
    userMessage: "Failed to access microphone: " + (err?.message || name || "Unknown error"),
  };
}
`;

fs.writeFileSync(path.join(clientRoot, 'features/call/services/callDiagnostics.ts'), callDiagnosticsContent);
console.log('✅ Created features/call/services/callDiagnostics.ts');
