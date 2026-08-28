/**
 * Production Call Observability & Technical Diagnostics
 * Provides structured JSON logging and diagnostic lifecycle tracking without leaking private credentials.
 */

export type CallDiagnosticStage =
  | "INITIATED"
  | "RINGING"
  | "ACCEPTED"
  | "CONNECTED"
  | "ENDED"
  | "DECLINED"
  | "CANCELLED"
  | "MISSED"
  | "BUSY"
  | "FAILED"
  | "DISCONNECTED";

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

export interface CallDiagnosticRecord {
  timestamp: string;
  stage: CallDiagnosticStage;
  callId: string;
  conversationId?: string;
  userId?: string;
  role?: "caller" | "callee" | "server";
  failureCategory?: CallFailureCategory;
  durationSeconds?: number;
  setupTimeMs?: number;
  details?: Record<string, unknown>;
}

// In-memory lightweight counters for server diagnostics
export interface CallServerMetrics {
  callsInitiated: number;
  callsAccepted: number;
  callsConnected: number;
  callsEnded: number;
  callsMissed: number;
  callsDeclined: number;
  callsCancelled: number;
  callsBusy: number;
  callsFailed: number;
}

const metrics: CallServerMetrics = {
  callsInitiated: 0,
  callsAccepted: 0,
  callsConnected: 0,
  callsEnded: 0,
  callsMissed: 0,
  callsDeclined: 0,
  callsCancelled: 0,
  callsBusy: 0,
  callsFailed: 0,
};

export const getCallServerMetrics = (): Readonly<CallServerMetrics> => {
  return { ...metrics };
};

/**
 * Emit structured, sanitized diagnostic record
 */
export const logCallDiagnostic = (record: CallDiagnosticRecord): void => {
  // Update internal counters
  switch (record.stage) {
    case "INITIATED":
      metrics.callsInitiated++;
      break;
    case "ACCEPTED":
      metrics.callsAccepted++;
      break;
    case "CONNECTED":
      metrics.callsConnected++;
      break;
    case "ENDED":
      metrics.callsEnded++;
      break;
    case "MISSED":
      metrics.callsMissed++;
      break;
    case "DECLINED":
      metrics.callsDeclined++;
      break;
    case "CANCELLED":
      metrics.callsCancelled++;
      break;
    case "BUSY":
      metrics.callsBusy++;
      break;
    case "FAILED":
      metrics.callsFailed++;
      break;
  }

  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const detailStr = record.details ? ` | ${JSON.stringify(record.details)}` : "";
    console.log(
      `📊 [CallDiag:${record.stage}] [${record.callId}] user=${record.userId || "N/A"}${detailStr}`
    );
  } else {
    // Production structured JSON format (machine parseable for Datadog / CloudWatch / ELK)
    console.log(
      JSON.stringify({
        logType: "CALL_DIAGNOSTICS",
        ...record,
      })
    );
  }
};
