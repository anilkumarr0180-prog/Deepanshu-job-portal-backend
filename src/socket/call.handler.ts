import { Server } from "socket.io";
import { AuthenticatedSocket } from "../config/socket";
import Conversation from "../models/conversation.model";
import User from "../models/user.model";
import {
  CallSession,
  CallStatus,
  CallInitiateData,
  CallAcceptData,
  CallRejectData,
  CallCancelData,
  CallEndData,
  CallOfferData,
  CallAnswerData,
  CallIceCandidateData,
  SaveCallTerminalInput,
} from "../types/call.types";
import { saveCallRecord, getUnreadMissedCallsCount } from "../services/call.service";
import { logCallDiagnostic } from "./call.diagnostics";

// In-memory call sessions: callId -> CallSession
export const activeCallsMap = new Map<string, CallSession>();
// User active call mapping: userId -> callId (for O(1) busy checks)
export const userActiveCallMap = new Map<string, string>();

const RINGING_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Persist terminal call record and broadcast realtime events only after successful database write
 */
const persistAndNotifyTerminalCall = (io: Server, input: SaveCallTerminalInput) => {
  saveCallRecord(input)
    .then(async (savedCall) => {
      const callerIdStr = savedCall.callerId.toString();
      const receiverIdStr = savedCall.receiverId.toString();

      // Clean, safe public payload for clients
      const historyPayload = {
        _id: savedCall._id.toString(),
        id: savedCall._id.toString(),
        callId: savedCall.callId,
        conversationId: savedCall.conversationId.toString(),
        callerId: callerIdStr,
        receiverId: receiverIdStr,
        status: savedCall.status,
        startedAt: savedCall.startedAt,
        answeredAt: savedCall.answeredAt || null,
        endedAt: savedCall.endedAt || null,
        durationSeconds: savedCall.durationSeconds || 0,
        endReason: savedCall.endReason,
        createdAt: savedCall.createdAt,
      };

      // 1. Emit call:history_created to both caller and receiver private rooms
      io.to(`user_${callerIdStr}`).emit("call:history_created", historyPayload);
      io.to(`user_${receiverIdStr}`).emit("call:history_created", historyPayload);

      // 2. If status === "missed", emit call:missed and update unread count for receiver
      if (savedCall.status === "missed") {
        io.to(`user_${receiverIdStr}`).emit("call:missed", historyPayload);

        try {
          const unreadMissedCallCount = await getUnreadMissedCallsCount(receiverIdStr);
          io.to(`user_${receiverIdStr}`).emit("call:missed_count_updated", {
            unreadMissedCallCount,
          });
        } catch (countErr) {
          console.error(`[CallPersistence] Failed to fetch unread missed count for ${receiverIdStr}:`, countErr);
        }
      }
    })
    .catch((err) => {
      console.error(`[CallPersistence] Error persisting call [${input.callId}]:`, err.message || err);
    });
};

/**
 * Register all call signaling handlers on a newly authenticated socket
 */
export const registerCallHandlers = (io: Server, socket: AuthenticatedSocket) => {
  const userId = socket.user?.userId;
  if (!userId) return;

  /*
  |--------------------------------------------------------------------------
  | 1. Initiate Call
  |--------------------------------------------------------------------------
  */
  socket.on("call:initiate", async (data: CallInitiateData) => {
    try {
      const { conversationId } = data;
      if (!conversationId) {
        socket.emit("call:error", { message: "Conversation ID is required." });
        return;
      }

      // 1. Verify caller is not already in an active call
      if (userActiveCallMap.has(userId)) {
        socket.emit("call:error", { message: "You are already in an active call." });
        return;
      }

      // 2. Fetch conversation & verify membership
      const conversation = await Conversation.findById(conversationId).lean();
      if (!conversation || conversation.isDeleted) {
        socket.emit("call:error", { message: "Conversation not found." });
        return;
      }

      const candidateIdStr = conversation.candidateId.toString();
      const recruiterIdStr = conversation.recruiterId.toString();

      if (candidateIdStr !== userId && recruiterIdStr !== userId) {
        socket.emit("call:error", { message: "Unauthorized: You are not part of this conversation." });
        return;
      }

      // 3. Derive target callee
      const targetUserId = candidateIdStr === userId ? recruiterIdStr : candidateIdStr;

      // 4. Fetch caller & callee user info
      const [callerDoc, calleeDoc] = await Promise.all([
        User.findById(userId).select("name profilePicture role isBlocked isDeleted").lean(),
        User.findById(targetUserId).select("name profilePicture role isBlocked isDeleted").lean(),
      ]);

      if (!calleeDoc || calleeDoc.isDeleted || calleeDoc.isBlocked) {
        socket.emit("call:error", { message: "Cannot place call: User is unavailable or blocked." });
        return;
      }

      // 5. Check if target callee is busy
      if (userActiveCallMap.has(targetUserId)) {
        const busyCallId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        socket.emit("call:rejected", {
          conversationId,
          reason: "busy",
          message: `${calleeDoc.name || "User"} is currently on another call.`,
        });

        // Diagnostic log
        logCallDiagnostic({
          timestamp: new Date().toISOString(),
          stage: "BUSY",
          callId: busyCallId,
          conversationId,
          userId,
          role: "caller",
          details: { targetUserId, reason: "callee_busy" },
        });

        // Persist busy call attempt & emit realtime update
        persistAndNotifyTerminalCall(io, {
          callId: busyCallId,
          conversationId,
          callerId: userId,
          receiverId: targetUserId,
          status: "busy",
          startedAt: new Date(),
          endedAt: new Date(),
          endReason: "user_busy",
        });

        return;
      }

      // 6. Create call session
      const callId = `call_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

      const callSession: CallSession = {
        callId,
        conversationId,
        caller: {
          userId,
          socketId: socket.id,
          name: callerDoc?.name || "Caller",
          profilePicture: callerDoc?.profilePicture,
          role: callerDoc?.role,
        },
        callee: {
          userId: targetUserId,
          socketId: "",
          name: calleeDoc?.name || "User",
          profilePicture: calleeDoc?.profilePicture,
          role: calleeDoc?.role,
        },
        status: "ringing",
        startedAt: new Date(),
      };

      // Set timeout for missed call
      callSession.timeoutTimer = setTimeout(() => {
        const session = activeCallsMap.get(callId);
        if (session && session.status === "ringing") {
          session.status = "missed";
          session.endedAt = new Date();
          activeCallsMap.delete(callId);
          userActiveCallMap.delete(userId);
          userActiveCallMap.delete(targetUserId);

          io.to(`user_${userId}`).emit("call:rejected", {
            callId,
            reason: "missed",
            message: "Call was not answered.",
          });
          io.to(`user_${targetUserId}`).emit("call:cancelled", {
            callId,
            reason: "missed",
          });

          // Diagnostic log
          logCallDiagnostic({
            timestamp: new Date().toISOString(),
            stage: "MISSED",
            callId,
            conversationId: session.conversationId,
            userId: session.caller.userId,
            role: "caller",
            failureCategory: "TIMEOUT",
            details: { calleeId: session.callee.userId, ringingTimeoutMs: RINGING_TIMEOUT_MS },
          });

          // Persist missed call record & broadcast realtime missed events
          persistAndNotifyTerminalCall(io, {
            callId: session.callId,
            conversationId: session.conversationId,
            callerId: session.caller.userId,
            receiverId: session.callee.userId,
            status: "missed",
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            endReason: "timeout",
          });
        }
      }, RINGING_TIMEOUT_MS);

      // Register active session
      activeCallsMap.set(callId, callSession);
      userActiveCallMap.set(userId, callId);
      userActiveCallMap.set(targetUserId, callId);

      // Diagnostic log
      logCallDiagnostic({
        timestamp: new Date().toISOString(),
        stage: "INITIATED",
        callId,
        conversationId,
        userId,
        role: "caller",
        details: { targetUserId },
      });

      // Acknowledge caller that ringing has started
      socket.emit("call:ringing", {
        callId,
        conversationId,
        callee: {
          id: targetUserId,
          name: calleeDoc?.name,
          profilePicture: calleeDoc?.profilePicture,
          role: calleeDoc?.role,
        },
      });

      // Dispatch incoming call to callee's user room
      io.to(`user_${targetUserId}`).emit("call:incoming", {
        callId,
        conversationId,
        caller: {
          id: userId,
          name: callerDoc?.name,
          profilePicture: callerDoc?.profilePicture,
          role: callerDoc?.role,
        },
      });
    } catch (err) {
      console.error("Error in call:initiate handler:", err);
      socket.emit("call:error", { message: "Failed to initiate call." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | 2. Accept Call
  |--------------------------------------------------------------------------
  */
  socket.on("call:accept", (data: CallAcceptData) => {
    try {
      const { callId } = data;
      const session = activeCallsMap.get(callId);

      if (!session) {
        socket.emit("call:error", { message: "Call session not found or already expired." });
        return;
      }

      if (session.callee.userId !== userId) {
        socket.emit("call:error", { message: "Unauthorized: You are not the recipient of this call." });
        return;
      }

      if (session.status !== "ringing") {
        socket.emit("call:error", { message: `Cannot accept call in '${session.status}' state.` });
        return;
      }

      // Clear ringing timer
      if (session.timeoutTimer) {
        clearTimeout(session.timeoutTimer);
        session.timeoutTimer = undefined;
      }

      session.status = "accepted";
      session.acceptedAt = new Date();
      session.callee.socketId = socket.id;

      const setupTimeMs = session.startedAt
        ? session.acceptedAt.getTime() - session.startedAt.getTime()
        : 0;

      // Diagnostic log
      logCallDiagnostic({
        timestamp: new Date().toISOString(),
        stage: "ACCEPTED",
        callId,
        conversationId: session.conversationId,
        userId,
        role: "callee",
        setupTimeMs,
        details: { callerId: session.caller.userId },
      });

      // Notify caller that callee accepted
      io.to(`user_${session.caller.userId}`).emit("call:accepted", {
        callId,
        callee: session.callee,
      });

      // Confirm to accepting socket
      socket.emit("call:accepted", {
        callId,
        caller: session.caller,
      });

      // If user had multiple tabs open, dismiss the incoming ringing modal on other tabs
      socket.to(`user_${userId}`).emit("call:accepted_elsewhere", { callId });
    } catch (err) {
      console.error("Error in call:accept handler:", err);
      socket.emit("call:error", { message: "Failed to accept call." });
    }
  });

  /*
  |--------------------------------------------------------------------------
  | 3. Reject Call
  |--------------------------------------------------------------------------
  */
  socket.on("call:reject", (data: CallRejectData) => {
    try {
      const { callId, reason } = data;
      const session = activeCallsMap.get(callId);

      if (!session) return;

      if (session.callee.userId !== userId && session.caller.userId !== userId) {
        return;
      }

      // Clear timer
      if (session.timeoutTimer) {
        clearTimeout(session.timeoutTimer);
        session.timeoutTimer = undefined;
      }

      session.status = "declined";
      session.endedAt = new Date();
      activeCallsMap.delete(callId);
      userActiveCallMap.delete(session.caller.userId);
      userActiveCallMap.delete(session.callee.userId);

      // Diagnostic log
      logCallDiagnostic({
        timestamp: new Date().toISOString(),
        stage: "DECLINED",
        callId,
        conversationId: session.conversationId,
        userId,
        role: "callee",
        failureCategory: "REMOTE_HANGUP",
        details: { callerId: session.caller.userId, reason: reason || "declined" },
      });

      // Notify caller
      io.to(`user_${session.caller.userId}`).emit("call:rejected", {
        callId,
        reason: "declined",
        message: `${session.callee.name || "User"} declined the call.`,
      });

      // Dismiss on all callee tabs
      io.to(`user_${session.callee.userId}`).emit("call:cancelled", { callId });

      // Persist declined call record & broadcast realtime history event
      persistAndNotifyTerminalCall(io, {
        callId: session.callId,
        conversationId: session.conversationId,
        callerId: session.caller.userId,
        receiverId: session.callee.userId,
        status: "declined",
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        endReason: reason || "declined",
      });
    } catch (err) {
      console.error("Error in call:reject handler:", err);
    }
  });

  /*
  |--------------------------------------------------------------------------
  | 4. Cancel Call (Caller cancels before answer)
  |--------------------------------------------------------------------------
  */
  socket.on("call:cancel", (data: CallCancelData) => {
    try {
      const { callId } = data;
      const session = activeCallsMap.get(callId);

      if (!session) return;

      if (session.caller.userId !== userId) {
        return;
      }

      if (session.timeoutTimer) {
        clearTimeout(session.timeoutTimer);
        session.timeoutTimer = undefined;
      }

      session.status = "cancelled";
      session.endedAt = new Date();
      activeCallsMap.delete(callId);
      userActiveCallMap.delete(session.caller.userId);
      userActiveCallMap.delete(session.callee.userId);

      // Diagnostic log
      logCallDiagnostic({
        timestamp: new Date().toISOString(),
        stage: "CANCELLED",
        callId,
        conversationId: session.conversationId,
        userId,
        role: "caller",
        failureCategory: "LOCAL_HANGUP",
        details: { calleeId: session.callee.userId },
      });

      // Notify callee to dismiss incoming call modal
      io.to(`user_${session.callee.userId}`).emit("call:cancelled", {
        callId,
        reason: "cancelled",
      });

      // Confirm to caller
      socket.emit("call:cancelled", { callId });

      // Persist cancelled call record & broadcast realtime history event
      persistAndNotifyTerminalCall(io, {
        callId: session.callId,
        conversationId: session.conversationId,
        callerId: session.caller.userId,
        receiverId: session.callee.userId,
        status: "cancelled",
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        endReason: "cancelled_by_caller",
      });
    } catch (err) {
      console.error("Error in call:cancel handler:", err);
    }
  });

  /*
  |--------------------------------------------------------------------------
  | 5. Call Failed (Reported by either party upon media/ICE failure)
  |--------------------------------------------------------------------------
  */
  socket.on("call:failed", (data: { callId: string; reason?: string; message?: string }) => {
    try {
      const { callId, reason, message } = data;
      const session = activeCallsMap.get(callId);
      if (!session) return;

      if (session.caller.userId !== userId && session.callee.userId !== userId) {
        return;
      }

      if (session.timeoutTimer) {
        clearTimeout(session.timeoutTimer);
        session.timeoutTimer = undefined;
      }

      session.status = "failed";
      session.endedAt = new Date();
      activeCallsMap.delete(callId);
      userActiveCallMap.delete(session.caller.userId);
      userActiveCallMap.delete(session.callee.userId);

      const targetUserId =
        session.caller.userId === userId ? session.callee.userId : session.caller.userId;

      // Diagnostic log
      logCallDiagnostic({
        timestamp: new Date().toISOString(),
        stage: "FAILED",
        callId,
        conversationId: session.conversationId,
        userId,
        role: session.caller.userId === userId ? "caller" : "callee",
        failureCategory: "WEBRTC_CONNECTION_ERROR",
        details: { reason: reason || "webrtc_failed", message: message || "Audio call connection failed." },
      });

      io.to(`user_${targetUserId}`).emit("call:failed", {
        callId,
        reason: reason || "webrtc_failed",
        message: message || "Audio call connection failed.",
      });

      // Persist failed call record & broadcast realtime history event
      persistAndNotifyTerminalCall(io, {
        callId: session.callId,
        conversationId: session.conversationId,
        callerId: session.caller.userId,
        receiverId: session.callee.userId,
        status: "failed",
        startedAt: session.startedAt,
        acceptedAt: session.acceptedAt,
        endedAt: session.endedAt,
        endReason: reason || "webrtc_failed",
      });
    } catch (err) {
      console.error("Error in call:failed handler:", err);
    }
  });

  /*
  |--------------------------------------------------------------------------
  | 6. End Call (Active call ended by either party)
  |--------------------------------------------------------------------------
  */
  socket.on("call:end", (data: CallEndData) => {
    try {
      const { callId } = data;
      const session = activeCallsMap.get(callId);

      if (!session) return;

      if (session.caller.userId !== userId && session.callee.userId !== userId) {
        return;
      }

      if (session.timeoutTimer) {
        clearTimeout(session.timeoutTimer);
        session.timeoutTimer = undefined;
      }

      session.status = "ended";
      session.endedAt = new Date();
      if (session.acceptedAt) {
        session.durationSeconds = Math.max(
          0,
          Math.floor((session.endedAt.getTime() - session.acceptedAt.getTime()) / 1000)
        );
      }

      activeCallsMap.delete(callId);
      userActiveCallMap.delete(session.caller.userId);
      userActiveCallMap.delete(session.callee.userId);

      // Diagnostic log
      logCallDiagnostic({
        timestamp: new Date().toISOString(),
        stage: "ENDED",
        callId,
        conversationId: session.conversationId,
        userId,
        role: session.caller.userId === userId ? "caller" : "callee",
        durationSeconds: session.durationSeconds || 0,
        details: { endedBy: userId },
      });

      // Notify both participants
      io.to(`user_${session.caller.userId}`).emit("call:ended", {
        callId,
        durationSeconds: session.durationSeconds || 0,
      });
      io.to(`user_${session.callee.userId}`).emit("call:ended", {
        callId,
        durationSeconds: session.durationSeconds || 0,
      });

      // Persist completed call record & broadcast realtime history event
      persistAndNotifyTerminalCall(io, {
        callId: session.callId,
        conversationId: session.conversationId,
        callerId: session.caller.userId,
        receiverId: session.callee.userId,
        status: "ended",
        startedAt: session.startedAt,
        acceptedAt: session.acceptedAt,
        endedAt: session.endedAt,
        endReason: "completed",
      });
    } catch (err) {
      console.error("Error in call:end handler:", err);
    }
  });

  /*
  |--------------------------------------------------------------------------
  | 7. WebRTC SDP Offer Relay
  |--------------------------------------------------------------------------
  */
  socket.on("call:offer", (data: CallOfferData) => {
    try {
      const { callId, sdp } = data;
      if (!callId || !sdp) return;

      const session = activeCallsMap.get(callId);
      if (!session) return;

      if (session.caller.userId !== userId && session.callee.userId !== userId) {
        return;
      }

      if (session.hasOffered) {
        return;
      }
      session.hasOffered = true;

      const targetSocketId =
        session.caller.userId === userId ? session.callee.socketId : session.caller.socketId;

      if (targetSocketId) {
        io.to(targetSocketId).emit("call:offer", {
          callId,
          sdp,
          callerId: userId,
        });
      } else {
        const targetUserId =
          session.caller.userId === userId ? session.callee.userId : session.caller.userId;
        io.to(`user_${targetUserId}`).emit("call:offer", {
          callId,
          sdp,
          callerId: userId,
        });
      }
    } catch (err) {
      console.error("Error in call:offer handler:", err);
    }
  });

  /*
  |--------------------------------------------------------------------------
  | 8. WebRTC SDP Answer Relay
  |--------------------------------------------------------------------------
  */
  socket.on("call:answer", (data: CallAnswerData) => {
    try {
      const { callId, sdp } = data;
      if (!callId || !sdp) return;

      const session = activeCallsMap.get(callId);
      if (!session) return;

      if (session.caller.userId !== userId && session.callee.userId !== userId) {
        return;
      }

      if (session.hasAnswered) {
        return;
      }
      session.hasAnswered = true;

      const targetSocketId =
        session.caller.userId === userId ? session.callee.socketId : session.caller.socketId;

      if (targetSocketId) {
        io.to(targetSocketId).emit("call:answer", {
          callId,
          sdp,
          calleeId: userId,
        });
      } else {
        const targetUserId =
          session.caller.userId === userId ? session.callee.userId : session.caller.userId;
        io.to(`user_${targetUserId}`).emit("call:answer", {
          callId,
          sdp,
          calleeId: userId,
        });
      }
    } catch (err) {
      console.error("Error in call:answer handler:", err);
    }
  });

  /*
  |--------------------------------------------------------------------------
  | 9. WebRTC ICE Candidate Relay (Trickle ICE)
  |--------------------------------------------------------------------------
  */
  socket.on("call:ice_candidate", (data: CallIceCandidateData) => {
    try {
      const { callId, candidate } = data;
      if (!callId || !candidate) return;

      const session = activeCallsMap.get(callId);
      if (!session) return;

      if (session.caller.userId !== userId && session.callee.userId !== userId) {
        return;
      }

      const targetSocketId =
        session.caller.userId === userId ? session.callee.socketId : session.caller.socketId;

      if (targetSocketId) {
        io.to(targetSocketId).emit("call:ice_candidate", {
          callId,
          candidate,
          fromUserId: userId,
        });
      } else {
        const targetUserId =
          session.caller.userId === userId ? session.callee.userId : session.caller.userId;
        io.to(`user_${targetUserId}`).emit("call:ice_candidate", {
          callId,
          candidate,
          fromUserId: userId,
        });
      }
    } catch (err) {
      console.error("Error in call:ice_candidate handler:", err);
    }
  });
};

/**
 * Handle call cleanup when a socket disconnects
 */
export const handleCallDisconnect = (io: Server, socket: AuthenticatedSocket) => {
  const userId = socket.user?.userId;
  if (!userId) return;

  const activeCallId = userActiveCallMap.get(userId);
  if (!activeCallId) return;

  const session = activeCallsMap.get(activeCallId);
  if (!session) {
    userActiveCallMap.delete(userId);
    return;
  }

  // Multi-tab protection: if user has multiple tabs, only terminate if the call's active socket disconnected
  const isCallerCallSocket = session.caller.socketId === socket.id;
  const isCalleeCallSocket = session.callee.socketId === socket.id;

  // If the disconnected socket is neither the caller's call socket nor the callee's call socket, do not kill the call
  if (!isCallerCallSocket && !isCalleeCallSocket && session.status === "accepted") {
    return;
  }

  // Clear timeout
  if (session.timeoutTimer) {
    clearTimeout(session.timeoutTimer);
    session.timeoutTimer = undefined;
  }

  activeCallsMap.delete(activeCallId);
  userActiveCallMap.delete(session.caller.userId);
  userActiveCallMap.delete(session.callee.userId);

  const peerId = session.caller.userId === userId ? session.callee.userId : session.caller.userId;
  const endedAt = new Date();
  session.endedAt = endedAt;

  let finalStatus: CallStatus = "ended";
  let endReason = "disconnected";

  if (session.status === "ringing") {
    finalStatus = "cancelled";
    endReason = "caller_disconnected";
    io.to(`user_${peerId}`).emit("call:cancelled", {
      callId: activeCallId,
      reason: "disconnected",
    });
  } else if (session.status === "accepted") {
    finalStatus = "ended";
    endReason = "socket_disconnected";
    if (session.acceptedAt) {
      session.durationSeconds = Math.max(
        0,
        Math.floor((endedAt.getTime() - session.acceptedAt.getTime()) / 1000)
      );
    }
    io.to(`user_${peerId}`).emit("call:ended", {
      callId: activeCallId,
      durationSeconds: session.durationSeconds || 0,
      reason: "disconnected",
    });
  }

  // Diagnostic log
  logCallDiagnostic({
    timestamp: new Date().toISOString(),
    stage: "DISCONNECTED",
    callId: activeCallId,
    conversationId: session.conversationId,
    userId,
    failureCategory: "SOCKET_DISCONNECT",
    details: { finalStatus, endReason },
  });

  // Persist disconnected call record & broadcast realtime history event
  persistAndNotifyTerminalCall(io, {
    callId: session.callId,
    conversationId: session.conversationId,
    callerId: session.caller.userId,
    receiverId: session.callee.userId,
    status: finalStatus,
    startedAt: session.startedAt,
    acceptedAt: session.acceptedAt,
    endedAt: session.endedAt,
    endReason,
  });
};
