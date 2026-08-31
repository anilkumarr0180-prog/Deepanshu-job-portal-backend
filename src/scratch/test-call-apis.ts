import dotenv from "dotenv";
dotenv.config();

import mongoose, { Types } from "mongoose";
import connectDB from "../config/database";
import Call from "../models/call.model";
import Conversation from "../models/conversation.model";
import User from "../models/user.model";
import {
  getUserCallHistory,
  getConversationCallHistory,
  getUnreadMissedCallsCount,
  markMissedCallsAsRead,
} from "../services/call.service";

const runApiIntegrationTests = async () => {
  try {
    await connectDB();
    console.log("🚀 Connected to MongoDB for REST Call API Integration Tests\n");

    const userAId = new Types.ObjectId().toString();
    const userBId = new Types.ObjectId().toString();
    const userCId = new Types.ObjectId().toString(); // Unrelated third party

    // Create a real conversation document for AB in DB
    const convAB = await Conversation.create({
      candidateId: new Types.ObjectId(userAId),
      recruiterId: new Types.ObjectId(userBId),
      lastMessageAt: new Date(),
      isDeleted: false,
    });
    const convABId = convAB._id.toString();

    // Create a conversation document for BC
    const convBC = await Conversation.create({
      candidateId: new Types.ObjectId(userBId),
      recruiterId: new Types.ObjectId(userCId),
      lastMessageAt: new Date(),
      isDeleted: false,
    });
    const convBCId = convBC._id.toString();

    console.log("1. Seeding test calls...");
    // Call 1: A calls B -> ended (talk time 60s)
    await Call.create({
      callId: `call_api_1_${Date.now()}`,
      conversationId: convAB._id,
      callerId: new Types.ObjectId(userAId),
      receiverId: new Types.ObjectId(userBId),
      status: "ended",
      startedAt: new Date(Date.now() - 70000),
      answeredAt: new Date(Date.now() - 60000),
      endedAt: new Date(),
      durationSeconds: 60,
      endReason: "completed",
      isMissedCallRead: true,
    });

    // Call 2: A calls B -> missed
    await Call.create({
      callId: `call_api_2_${Date.now()}`,
      conversationId: convAB._id,
      callerId: new Types.ObjectId(userAId),
      receiverId: new Types.ObjectId(userBId),
      status: "missed",
      startedAt: new Date(Date.now() - 30000),
      endedAt: new Date(),
      durationSeconds: 0,
      endReason: "timeout",
      isMissedCallRead: false,
    });

    // Call 3: B calls C -> declined
    await Call.create({
      callId: `call_api_3_${Date.now()}`,
      conversationId: convBC._id,
      callerId: new Types.ObjectId(userBId),
      receiverId: new Types.ObjectId(userCId),
      status: "declined",
      startedAt: new Date(Date.now() - 10000),
      endedAt: new Date(),
      durationSeconds: 0,
      endReason: "declined",
      isMissedCallRead: true,
    });

    console.log("--------------------------------------------------");
    console.log("TEST 1: GET /api/calls/history for User A");
    const historyA = await getUserCallHistory(userAId, { page: "1", limit: "10" });
    console.log(`User A call history count: ${historyA.pagination.totalItems}`);
    if (historyA.pagination.totalItems !== 2) {
      throw new Error(`TEST 1 Failed: Expected 2 calls for User A, got ${historyA.pagination.totalItems}`);
    }
    console.log("✅ TEST 1 Passed: User A only sees their 2 calls (conversation AB).");

    console.log("--------------------------------------------------");
    console.log("TEST 2: GET /api/calls/history for User B (Participates in AB and BC)");
    const historyB = await getUserCallHistory(userBId, { page: "1", limit: "10" });
    console.log(`User B call history count: ${historyB.pagination.totalItems}`);
    if (historyB.pagination.totalItems !== 3) {
      throw new Error(`TEST 2 Failed: Expected 3 calls for User B, got ${historyB.pagination.totalItems}`);
    }
    console.log("✅ TEST 2 Passed: User B sees all 3 calls across AB and BC.");

    console.log("--------------------------------------------------");
    console.log("TEST 3: GET /api/calls/history with Status Filter");
    const missedHistoryA = await getUserCallHistory(userAId, { status: "missed" });
    console.log(`User A missed calls count: ${missedHistoryA.pagination.totalItems}`);
    if (missedHistoryA.pagination.totalItems !== 1 || missedHistoryA.items[0].status !== "missed") {
      throw new Error(`TEST 3 Failed: Expected 1 missed call for User A filter`);
    }
    console.log("✅ TEST 3 Passed: Status filter correctly isolates 'missed' calls.");

    console.log("--------------------------------------------------");
    console.log("TEST 4: GET /api/calls/conversation/:conversationId Authorization");
    // Participant A accessing convAB -> allowed
    const convHistoryA = await getConversationCallHistory(convABId, userAId);
    console.log(`Participant A access to Conv AB calls: ${convHistoryA.pagination.totalItems}`);
    if (convHistoryA.pagination.totalItems !== 2) {
      throw new Error(`TEST 4 Failed: Expected 2 calls in Conv AB`);
    }

    // Non-participant C accessing convAB -> forbidden
    let forbiddenCaught = false;
    try {
      await getConversationCallHistory(convABId, userCId);
    } catch (err: any) {
      if (err.statusCode === 403 || err.message?.includes("not authorized")) {
        forbiddenCaught = true;
      }
    }
    if (!forbiddenCaught) {
      throw new Error("TEST 4 Security Failed: Non-participant User C was able to access Conversation AB history!");
    }
    console.log("✅ TEST 4 Passed: Authorization check properly blocked unauthorized User C from viewing Conversation AB.");

    console.log("--------------------------------------------------");
    console.log("TEST 5: GET /api/calls/missed/unread-count & Mark Read");
    // User B was callee of missed call 2 -> count should be 1
    const unreadCountB = await getUnreadMissedCallsCount(userBId);
    console.log(`User B unread missed calls count: ${unreadCountB}`);
    if (unreadCountB !== 1) {
      throw new Error(`TEST 5 Failed: Expected 1 unread missed call for User B, got ${unreadCountB}`);
    }

    // User A was caller -> count should be 0
    const unreadCountA = await getUnreadMissedCallsCount(userAId);
    console.log(`User A unread missed calls count: ${unreadCountA}`);
    if (unreadCountA !== 0) {
      throw new Error(`TEST 5 Failed: Caller should not receive missed call unread count!`);
    }

    // User B marks missed calls as read
    const markResult = await markMissedCallsAsRead(userBId, convABId);
    console.log(`User B marked as read updatedCount: ${markResult.updatedCount}`);
    if (markResult.updatedCount !== 1) {
      throw new Error(`TEST 5 Failed: Expected 1 updated record`);
    }

    const unreadCountBAfter = await getUnreadMissedCallsCount(userBId);
    console.log(`User B unread count after mark: ${unreadCountBAfter}`);
    if (unreadCountBAfter !== 0) {
      throw new Error(`TEST 5 Failed: Unread count did not reset to 0`);
    }
    console.log("✅ TEST 5 Passed: Missed call unread count & atomic mark-read operates accurately.");

    // Clean up test documents
    await Call.deleteMany({ conversationId: { $in: [convAB._id, convBC._id] } });
    await Conversation.deleteMany({ _id: { $in: [convAB._id, convBC._id] } });

    console.log("\n🎉 ALL REST API INTEGRATION & SECURITY TESTS PASSED WITH 100% SUCCESS!");
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ REST API Test Execution Failed:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

runApiIntegrationTests();
