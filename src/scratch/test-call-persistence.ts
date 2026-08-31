import dotenv from "dotenv";
dotenv.config();

import mongoose, { Types } from "mongoose";
import connectDB from "../config/database";
import Call from "../models/call.model";
import {
  saveCallRecord,
  getUserCallHistory,
  getConversationCallHistory,
  getUnreadMissedCallsCount,
  markMissedCallsAsRead,
} from "../services/call.service";

const runTests = async () => {
  try {
    await connectDB();
    console.log("🚀 Connected to MongoDB for Call Persistence Testing\n");

    const testConvId = new Types.ObjectId().toString();
    const userA = new Types.ObjectId().toString();
    const userB = new Types.ObjectId().toString();

    // Clean any previous test artifacts for this conversation
    await Call.deleteMany({ conversationId: new Types.ObjectId(testConvId) });

    console.log("--------------------------------------------------");
    console.log("TEST 1: A calls B -> B accepts -> connected -> A ends");
    const call1Id = `call_test1_${Date.now()}`;
    const start1 = new Date(Date.now() - 45000); // 45s ago
    const accepted1 = new Date(Date.now() - 40000); // 40s ago
    const ended1 = new Date(); // now -> 40s duration
    const call1 = await saveCallRecord({
      callId: call1Id,
      conversationId: testConvId,
      callerId: userA,
      receiverId: userB,
      status: "ended",
      startedAt: start1,
      acceptedAt: accepted1,
      endedAt: ended1,
      endReason: "completed",
    });
    console.log(`✅ TEST 1 Passed: status=${call1.status}, durationSeconds=${call1.durationSeconds}s (Expected ~40s)`);
    if (call1.status !== "ended" || call1.durationSeconds !== 40) {
      throw new Error(`TEST 1 Assertion Failed: duration=${call1.durationSeconds}`);
    }

    console.log("--------------------------------------------------");
    console.log("TEST 2: B calls A -> A ends");
    const call2Id = `call_test2_${Date.now()}`;
    const start2 = new Date(Date.now() - 15000);
    const accepted2 = new Date(Date.now() - 12000);
    const ended2 = new Date();
    const call2 = await saveCallRecord({
      callId: call2Id,
      conversationId: testConvId,
      callerId: userB,
      receiverId: userA,
      status: "ended",
      startedAt: start2,
      acceptedAt: accepted2,
      endedAt: ended2,
      endReason: "completed",
    });
    console.log(`✅ TEST 2 Passed: status=${call2.status}, durationSeconds=${call2.durationSeconds}s (Expected ~12s)`);
    if (call2.status !== "ended" || call2.durationSeconds !== 12) {
      throw new Error(`TEST 2 Assertion Failed`);
    }

    console.log("--------------------------------------------------");
    console.log("TEST 3: A calls B -> B rejects");
    const call3Id = `call_test3_${Date.now()}`;
    const call3 = await saveCallRecord({
      callId: call3Id,
      conversationId: testConvId,
      callerId: userA,
      receiverId: userB,
      status: "declined",
      startedAt: new Date(Date.now() - 5000),
      endedAt: new Date(),
      endReason: "declined",
    });
    console.log(`✅ TEST 3 Passed: status=${call3.status}, durationSeconds=${call3.durationSeconds}s (Expected 0s)`);
    if (call3.status !== "declined" || call3.durationSeconds !== 0) {
      throw new Error(`TEST 3 Assertion Failed`);
    }

    console.log("--------------------------------------------------");
    console.log("TEST 4: A calls B -> A cancels before answer");
    const call4Id = `call_test4_${Date.now()}`;
    const call4 = await saveCallRecord({
      callId: call4Id,
      conversationId: testConvId,
      callerId: userA,
      receiverId: userB,
      status: "cancelled",
      startedAt: new Date(Date.now() - 8000),
      endedAt: new Date(),
      endReason: "cancelled_by_caller",
    });
    console.log(`✅ TEST 4 Passed: status=${call4.status}, durationSeconds=${call4.durationSeconds}s (Expected 0s)`);
    if (call4.status !== "cancelled" || call4.durationSeconds !== 0) {
      throw new Error(`TEST 4 Assertion Failed`);
    }

    console.log("--------------------------------------------------");
    console.log("TEST 5: A calls B -> no answer (timeout / missed)");
    const call5Id = `call_test5_${Date.now()}`;
    const call5 = await saveCallRecord({
      callId: call5Id,
      conversationId: testConvId,
      callerId: userA,
      receiverId: userB,
      status: "missed",
      startedAt: new Date(Date.now() - 30000),
      endedAt: new Date(),
      endReason: "timeout",
    });
    console.log(`✅ TEST 5 Passed: status=${call5.status}, durationSeconds=${call5.durationSeconds}s, isMissedCallRead=${call5.isMissedCallRead} (Expected false)`);
    if (call5.status !== "missed" || call5.durationSeconds !== 0 || call5.isMissedCallRead !== false) {
      throw new Error(`TEST 5 Assertion Failed`);
    }

    console.log("--------------------------------------------------");
    console.log("TEST 6: Callee busy");
    const call6Id = `call_test6_${Date.now()}`;
    const call6 = await saveCallRecord({
      callId: call6Id,
      conversationId: testConvId,
      callerId: userA,
      receiverId: userB,
      status: "busy",
      startedAt: new Date(),
      endedAt: new Date(),
      endReason: "user_busy",
    });
    console.log(`✅ TEST 6 Passed: status=${call6.status}, durationSeconds=${call6.durationSeconds}s`);
    if (call6.status !== "busy" || call6.durationSeconds !== 0) {
      throw new Error(`TEST 6 Assertion Failed`);
    }

    console.log("--------------------------------------------------");
    console.log("TEST 7: WebRTC failure");
    const call7Id = `call_test7_${Date.now()}`;
    const call7 = await saveCallRecord({
      callId: call7Id,
      conversationId: testConvId,
      callerId: userA,
      receiverId: userB,
      status: "failed",
      startedAt: new Date(Date.now() - 4000),
      endedAt: new Date(),
      endReason: "ice_failed",
    });
    console.log(`✅ TEST 7 Passed: status=${call7.status}, durationSeconds=${call7.durationSeconds}s`);
    if (call7.status !== "failed" || call7.durationSeconds !== 0) {
      throw new Error(`TEST 7 Assertion Failed`);
    }

    console.log("--------------------------------------------------");
    console.log("TEST 8: Duplicate terminal signals (Idempotency)");
    // Repeat saveCallRecord for call1 with slight update
    const call1Dup = await saveCallRecord({
      callId: call1Id,
      conversationId: testConvId,
      callerId: userA,
      receiverId: userB,
      status: "ended",
      startedAt: start1,
      acceptedAt: accepted1,
      endedAt: ended1,
      endReason: "completed",
    });
    const dupCount = await Call.countDocuments({ callId: call1Id });
    console.log(`✅ TEST 8 Passed: Exact duplicate callId count = ${dupCount} (Expected 1)`);
    if (dupCount !== 1) {
      throw new Error(`TEST 8 Assertion Failed: Found ${dupCount} documents for callId`);
    }

    console.log("--------------------------------------------------");
    console.log("TEST 9: Rapid sequential calls");
    const seqCallA = `call_seqA_${Date.now()}`;
    const seqCallB = `call_seqB_${Date.now() + 1}`;
    await saveCallRecord({
      callId: seqCallA,
      conversationId: testConvId,
      callerId: userA,
      receiverId: userB,
      status: "ended",
      startedAt: new Date(Date.now() - 10000),
      acceptedAt: new Date(Date.now() - 8000),
      endedAt: new Date(),
      endReason: "completed",
    });
    await saveCallRecord({
      callId: seqCallB,
      conversationId: testConvId,
      callerId: userA,
      receiverId: userB,
      status: "ended",
      startedAt: new Date(Date.now() - 2000),
      acceptedAt: new Date(Date.now() - 1000),
      endedAt: new Date(),
      endReason: "completed",
    });
    const totalCallsInConv = await Call.countDocuments({ conversationId: new Types.ObjectId(testConvId) });
    console.log(`✅ TEST 9 Passed: Total separate call documents in test conversation = ${totalCallsInConv} (Expected 9)`);
    if (totalCallsInConv !== 9) {
      throw new Error(`TEST 9 Assertion Failed: Found ${totalCallsInConv}`);
    }

    console.log("--------------------------------------------------");
    console.log("TEST 10: Unread missed calls & Mark as Read");
    const unreadCount = await getUnreadMissedCallsCount(userB);
    console.log(`Unread missed calls for User B before mark: ${unreadCount}`);
    const markRes = await markMissedCallsAsRead(userB, testConvId);
    console.log(`Marked as read count: ${markRes.updatedCount}`);
    const unreadAfter = await getUnreadMissedCallsCount(userB);
    console.log(`Unread missed calls for User B after mark: ${unreadAfter} (Expected 0)`);
    if (unreadAfter !== 0) {
      throw new Error(`TEST 10 Assertion Failed: Unread count is ${unreadAfter}`);
    }

    // Cleanup test records
    await Call.deleteMany({ conversationId: new Types.ObjectId(testConvId) });
    console.log("\n🎉 ALL 10 TESTS PASSED WITH 100% SUCCESS!");

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error("❌ Test Execution Failed:", err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

runTests();
