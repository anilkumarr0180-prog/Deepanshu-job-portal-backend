import dotenv from "dotenv";
dotenv.config();

import mongoose, { Types } from "mongoose";
import { EventEmitter } from "events";
import connectDB from "../config/database";
import Call from "../models/call.model";
import Conversation from "../models/conversation.model";
import { saveCallRecord, getUnreadMissedCallsCount, markMissedCallsAsRead } from "../services/call.service";

// Mock IO room tracker to inspect exact broadcast behavior
class MockIO extends EventEmitter {
  public emittedEvents: Array<{ room: string; event: string; payload: any }> = [];

  to(room: string) {
    return {
      emit: (event: string, payload: any) => {
        this.emittedEvents.push({ room, event, payload });
        this.emit(`${room}:${event}`, payload);
      },
    };
  }
}

const runRealtimeTests = async () => {
  try {
    await connectDB();
    console.log("🚀 Connected to MongoDB for Realtime Call Sync Logic Tests\n");

    const userAId = new Types.ObjectId().toString();
    const userBId = new Types.ObjectId().toString();

    const convAB = await Conversation.create({
      candidateId: new Types.ObjectId(userAId),
      recruiterId: new Types.ObjectId(userBId),
      lastMessageAt: new Date(),
      isDeleted: false,
    });
    const convABId = convAB._id.toString();

    const mockIO = new MockIO();

    // Replicate persistAndNotifyTerminalCall logic exactly as in call.handler.ts
    const persistAndNotifyTerminalCall = async (input: any) => {
      const savedCall = await saveCallRecord(input);
      const callerIdStr = savedCall.callerId.toString();
      const receiverIdStr = savedCall.receiverId.toString();

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

      // 1. Emit to both participants
      mockIO.to(`user_${callerIdStr}`).emit("call:history_created", historyPayload);
      mockIO.to(`user_${receiverIdStr}`).emit("call:history_created", historyPayload);

      // 2. If missed, emit call:missed and update unread count for receiver
      if (savedCall.status === "missed") {
        mockIO.to(`user_${receiverIdStr}`).emit("call:missed", historyPayload);

        const unreadMissedCallCount = await getUnreadMissedCallsCount(receiverIdStr);
        mockIO.to(`user_${receiverIdStr}`).emit("call:missed_count_updated", {
          unreadMissedCallCount,
        });
      }

      return savedCall;
    };

    // --------------------------------------------------------------------------
    // TEST 1 — COMPLETED CALL REALTIME SYNCHRONIZATION
    // --------------------------------------------------------------------------
    console.log("--------------------------------------------------");
    console.log("TEST 1: Completed Call -> Realtime call:history_created emission");
    mockIO.emittedEvents = [];

    const call1Id = `call_rt_1_${Date.now()}`;
    await persistAndNotifyTerminalCall({
      callId: call1Id,
      conversationId: convABId,
      callerId: userAId,
      receiverId: userBId,
      status: "ended",
      startedAt: new Date(Date.now() - 40000),
      acceptedAt: new Date(Date.now() - 35000),
      endedAt: new Date(),
      endReason: "completed",
    });

    const emittedToA = mockIO.emittedEvents.find(
      (e) => e.room === `user_${userAId}` && e.event === "call:history_created"
    );
    const emittedToB = mockIO.emittedEvents.find(
      (e) => e.room === `user_${userBId}` && e.event === "call:history_created"
    );

    if (!emittedToA || !emittedToB) {
      throw new Error("TEST 1 Failed: Both participants did not receive call:history_created in their private user rooms");
    }
    if (emittedToA.payload.durationSeconds !== 35 || emittedToA.payload.status !== "ended") {
      throw new Error(`TEST 1 Failed: Payload verification mismatch (${emittedToA.payload.durationSeconds}s)`);
    }
    console.log(`✅ TEST 1 Passed: Both user_${userAId} and user_${userBId} received call:history_created event.`);

    // --------------------------------------------------------------------------
    // TEST 2 & 6 — MISSED CALL + MULTI-TAB BADGE SYNC
    // --------------------------------------------------------------------------
    console.log("--------------------------------------------------");
    console.log("TEST 2 & 6: Missed Call -> call:missed & call:missed_count_updated targeting");
    mockIO.emittedEvents = [];

    const missedCallId = `call_rt_missed_${Date.now()}`;
    await persistAndNotifyTerminalCall({
      callId: missedCallId,
      conversationId: convABId,
      callerId: userAId,
      receiverId: userBId,
      status: "missed",
      startedAt: new Date(Date.now() - 30000),
      endedAt: new Date(),
      endReason: "timeout",
    });

    const missedToB = mockIO.emittedEvents.find(
      (e) => e.room === `user_${userBId}` && e.event === "call:missed"
    );
    const missedCountToB = mockIO.emittedEvents.find(
      (e) => e.room === `user_${userBId}` && e.event === "call:missed_count_updated"
    );

    if (!missedToB || !missedCountToB) {
      throw new Error("TEST 2/6 Failed: Receiver did not receive call:missed and call:missed_count_updated");
    }
    if (missedCountToB.payload.unreadMissedCallCount !== 1) {
      throw new Error(`TEST 2/6 Failed: Expected count 1, got ${missedCountToB.payload.unreadMissedCallCount}`);
    }
    console.log(`✅ TEST 2 & 6 Passed: Receiver user_${userBId} received call:missed and call:missed_count_updated (count: ${missedCountToB.payload.unreadMissedCallCount}).`);

    // --------------------------------------------------------------------------
    // TEST 3 — MULTIPLE MISSED CALLS ACCUMULATION
    // --------------------------------------------------------------------------
    console.log("--------------------------------------------------");
    console.log("TEST 3: Multiple Missed Calls Realtime Count");
    mockIO.emittedEvents = [];

    await persistAndNotifyTerminalCall({
      callId: `call_rt_missed_2_${Date.now()}`,
      conversationId: convABId,
      callerId: userAId,
      receiverId: userBId,
      status: "missed",
      startedAt: new Date(Date.now() - 30000),
      endedAt: new Date(),
      endReason: "timeout",
    });
    await persistAndNotifyTerminalCall({
      callId: `call_rt_missed_3_${Date.now()}`,
      conversationId: convABId,
      callerId: userAId,
      receiverId: userBId,
      status: "missed",
      startedAt: new Date(Date.now() - 30000),
      endedAt: new Date(),
      endReason: "timeout",
    });

    const totalCount = await getUnreadMissedCallsCount(userBId);
    console.log(`Total unread missed calls in DB: ${totalCount}`);
    if (totalCount !== 3) {
      throw new Error(`TEST 3 Failed: Expected 3 unread missed calls, got ${totalCount}`);
    }
    console.log("✅ TEST 3 Passed: 3 missed calls accumulated and counted correctly.");

    // --------------------------------------------------------------------------
    // TEST 4 — MARK AS READ REALTIME SYNCHRONIZATION
    // --------------------------------------------------------------------------
    console.log("--------------------------------------------------");
    console.log("TEST 4: Mark Missed Calls as Read Realtime Sync");
    mockIO.emittedEvents = [];

    await markMissedCallsAsRead(userBId, convABId);
    const updatedCount = await getUnreadMissedCallsCount(userBId);
    mockIO.to(`user_${userBId}`).emit("call:missed_count_updated", {
      unreadMissedCallCount: updatedCount,
    });

    const markCountEvent = mockIO.emittedEvents.find(
      (e) => e.room === `user_${userBId}` && e.event === "call:missed_count_updated"
    );

    if (!markCountEvent || markCountEvent.payload.unreadMissedCallCount !== 0) {
      throw new Error(`TEST 4 Failed: Count did not update to 0`);
    }
    console.log(`✅ TEST 4 Passed: Mark-read reset unreadMissedCallCount to 0 and emitted to user_${userBId}.`);

    // Clean up test documents
    await Call.deleteMany({ conversationId: new Types.ObjectId(convABId) });
    await Conversation.deleteMany({ _id: new Types.ObjectId(convABId) });

    console.log("\n🎉 ALL REALTIME SYNCHRONIZATION LOGIC TESTS PASSED WITH 100% SUCCESS!");
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Realtime Test Execution Failed:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

runRealtimeTests();
