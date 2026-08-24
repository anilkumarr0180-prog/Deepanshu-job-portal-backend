import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/user.model";
import Job from "../models/job.model";
import Company from "../models/company.model";
import RecruiterProfile from "../models/recruiter-profile.model";
import CompanyRecruiter from "../models/company-recruiter.model";
import CandidateProfile from "../models/candidate-profile.model";
import Application from "../models/application.model";
import Conversation from "../models/conversation.model";
import Message from "../models/message.model";
import { USER_ROLES } from "../constants/roles";
import { EMPLOYMENT_TYPE } from "../constants/employment-type";
import { EXPERIENCE_LEVEL } from "../constants/experience-level";
import { JOB_STATUS } from "../constants/job-status";
import { APPLICATION_STATUS } from "../constants/application-status";
import {
  createOrGetConversation,
  getUserConversations,
  getConversationMessages,
  createMessage,
  markConversationMessagesAsRead,
  deleteMessage,
  getUnreadChatCount,
} from "../services/chat.service";

async function runChatLifecycleTests() {
  console.log("================================================================");
  console.log("   CONVERSATION & MESSAGE LIFECYCLE HARDENING AUDIT SUITE       ");
  console.log("================================================================");

  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal";
  await mongoose.connect(mongoUri);
  console.log(" Connected to MongoDB");

  // Sync MongoDB indexes
  console.log(" Syncing MongoDB indexes...");
  await Message.syncIndexes();
  await Conversation.syncIndexes();
  console.log(" Indexes synced successfully.\n");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(` PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}${detail ? " -> " + detail : ""}`);
      failed++;
    }
  }

  const testSuffix = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  try {
    // -------------------------------------------------------------------------
    // SETUP FIXTURES
    // -------------------------------------------------------------------------
    // 1. Recruiter
    const recruiterUser = await User.create({
      name: `Recruiter ${testSuffix}`,
      email: `recruiter_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.RECRUITER,
      isEmailVerified: true,
    });

    const recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      designation: "Lead Recruiter",
    });

    const company = await Company.create({
      name: `Innovate Corp ${testSuffix}`,
      description: "Test innovative technology company",
      recruiterId: recruiterUser._id,
      isVerified: true,
    });

    await CompanyRecruiter.create({
      companyId: company._id,
      recruiterProfileId: recruiterProfile._id,
      role: "owner",
      isPrimary: true,
      isDeleted: false,
    });

    // 2. Candidate 1
    const candidateUser = await User.create({
      name: `Candidate One ${testSuffix}`,
      email: `cand1_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.CANDIDATE,
      isEmailVerified: true,
    });

    await CandidateProfile.create({
      userId: candidateUser._id,
      skills: ["React", "Node.js"],
    });

    // 3. Candidate 2 (Unauthorized / Outsider)
    const outsiderCandidate = await User.create({
      name: `Candidate Two ${testSuffix}`,
      email: `cand2_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.CANDIDATE,
      isEmailVerified: true,
    });

    await CandidateProfile.create({
      userId: outsiderCandidate._id,
      skills: ["Python"],
    });

    // 4. Job
    const job = await Job.create({
      title: `Senior Fullstack Engineer ${testSuffix}`,
      description: "Build robust distributed backend systems.",
      company: company.name,
      companyId: company._id,
      recruiterId: recruiterUser._id,
      location: "San Francisco, CA",
      salaryMin: 150000,
      salaryMax: 200000,
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.THREE_TO_FIVE_YEARS,
      status: JOB_STATUS.ACTIVE,
      skills: ["React", "Node.js"],
    });

    // 5. Candidate 1 Applies for Job (Gating Requirement)
    await Application.create({
      jobId: job._id,
      applicantId: candidateUser._id,
      candidateProfileId: new Types.ObjectId(),
      resume: "https://example.com/resume.pdf",
      status: APPLICATION_STATUS.APPLIED,
      isDeleted: false,
    });

    // =========================================================================
    // [1] CONVERSATION CREATION & RETRIEVAL
    // =========================================================================
    console.log("--- [1] Conversation Creation & Retrieval ---");

    const conv1 = await createOrGetConversation(
      job._id.toString(),
      recruiterUser._id.toString(),
      candidateUser._id.toString()
    );

    assert(
      (conv1.candidateId as any)._id?.toString() === candidateUser._id.toString() &&
      (conv1.recruiterId as any)._id?.toString() === recruiterUser._id.toString() &&
      (conv1.jobId as any)._id?.toString() === job._id.toString(),
      "createOrGetConversation creates a new active conversation with canonical participant IDs"
    );

    // Get existing conversation
    const conv1Existing = await createOrGetConversation(
      job._id.toString(),
      recruiterUser._id.toString(),
      candidateUser._id.toString()
    );

    assert(
      conv1Existing._id.toString() === conv1._id.toString(),
      "createOrGetConversation returns existing conversation without creating duplicate document"
    );

    // =========================================================================
    // [2] SOFT-DELETE & RESTORATION (P0 FIX)
    // =========================================================================
    console.log("\n--- [2] Soft-Delete & Restoration (P0 Fix) ---");

    // Soft delete conversation
    await Conversation.findByIdAndUpdate(conv1._id, { isDeleted: true });

    // Verify it disappears from conversation list
    const candListDeleted: any = await getUserConversations(candidateUser._id.toString());
    const deletedItems = candListDeleted.data || candListDeleted.items || candListDeleted;
    assert(
      deletedItems.length === 0,
      "Soft-deleted conversation is hidden from active conversation list"
    );

    // Candidate starts chat again from Job listing -> Should restore existing conversation
    const restoredConv = await createOrGetConversation(
      job._id.toString(),
      recruiterUser._id.toString(),
      candidateUser._id.toString()
    );

    assert(
      restoredConv._id.toString() === conv1._id.toString() &&
      restoredConv.isDeleted === false,
      "Starting chat on a soft-deleted conversation successfully restores isDeleted=false without E11000 collision"
    );

    // =========================================================================
    // [3] CONCURRENT CREATION RACE CONDITION (P0 FIX)
    // =========================================================================
    console.log("\n--- [3] Concurrent Creation Race Condition (P0 Fix) ---");

    // Temporarily clean conversation fixture to simulate race on initial creation
    await Conversation.findByIdAndDelete(conv1._id);

    // Trigger 5 parallel creation requests simultaneously
    const concurrentResults = await Promise.all([
      createOrGetConversation(job._id.toString(), recruiterUser._id.toString(), candidateUser._id.toString()),
      createOrGetConversation(job._id.toString(), recruiterUser._id.toString(), candidateUser._id.toString()),
      createOrGetConversation(job._id.toString(), recruiterUser._id.toString(), candidateUser._id.toString()),
      createOrGetConversation(job._id.toString(), recruiterUser._id.toString(), candidateUser._id.toString()),
      createOrGetConversation(job._id.toString(), recruiterUser._id.toString(), candidateUser._id.toString()),
    ]);

    const allMatchSameId = concurrentResults.every((c) => c._id.toString() === concurrentResults[0]._id.toString());
    const totalDocsInDb = await Conversation.countDocuments({
      jobId: job._id,
      candidateId: candidateUser._id,
      recruiterId: recruiterUser._id,
    });

    assert(
      allMatchSameId && totalDocsInDb === 1,
      "Concurrent creation handles E11000 gracefully, returning the single winning conversation to all callers"
    );

    const activeConversation = concurrentResults[0];

    // =========================================================================
    // [4] ACCESS CONTROL & AUTHORIZATION (P1 FIX)
    // =========================================================================
    console.log("\n--- [4] Access Control & Authorization (P1 Fix) ---");

    // 4.1 Candidate Access
    const candConvs: any = await getUserConversations(candidateUser._id.toString());
    const candItems = candConvs.data || candConvs.items || candConvs;
    assert(
      candItems.length === 1 && candItems[0]._id.toString() === activeConversation._id.toString(),
      "Candidate can view their own authorized conversation"
    );

    // 4.2 Recruiter Access
    const recConvs: any = await getUserConversations(recruiterUser._id.toString());
    const recItems = recConvs.data || recConvs.items || recConvs;
    assert(
      recItems.length === 1 && recItems[0]._id.toString() === activeConversation._id.toString(),
      "Recruiter can view their own authorized conversation"
    );

    // 4.3 Outsider / Unauthorized Access
    let outsiderViewBlocked = false;
    try {
      await getConversationMessages(activeConversation._id.toString(), outsiderCandidate._id.toString());
    } catch (e: any) {
      outsiderViewBlocked = e.statusCode === 403 || e.message.includes("not authorized");
    }
    assert(outsiderViewBlocked, "Unauthorized user is blocked from viewing conversation messages (403 Forbidden)");

    let outsiderSendBlocked = false;
    try {
      await createMessage(activeConversation._id.toString(), outsiderCandidate._id.toString(), "Infiltrating message");
    } catch (e: any) {
      outsiderSendBlocked = e.statusCode === 403 || e.message.includes("not authorized");
    }
    assert(outsiderSendBlocked, "Unauthorized user is blocked from sending messages into foreign conversation (403 Forbidden)");

    // 4.4 Soft-deleted conversation cannot receive messages
    await Conversation.findByIdAndUpdate(activeConversation._id, { isDeleted: true });
    let deletedConvSendBlocked = false;
    try {
      await createMessage(activeConversation._id.toString(), candidateUser._id.toString(), "Hello into deleted");
    } catch (e: any) {
      deletedConvSendBlocked = e.statusCode === 404 || e.message.includes("not found");
    }
    assert(deletedConvSendBlocked, "Soft-deleted conversation cannot receive new messages (404 Not Found)");

    // Restore for subsequent message tests
    await Conversation.findByIdAndUpdate(activeConversation._id, { isDeleted: false });

    // =========================================================================
    // [5] MESSAGING LIFECYCLE & DELETION MODES
    // =========================================================================
    console.log("\n--- [5] Messaging Lifecycle & Deletion Modes ---");

    // 5.1 Send Message Candidate -> Recruiter
    const msg1 = await createMessage(
      activeConversation._id.toString(),
      candidateUser._id.toString(),
      "Hello, I would love to discuss the Senior Fullstack Engineer role."
    );
    assert(
      msg1.message === "Hello, I would love to discuss the Senior Fullstack Engineer role." &&
      (msg1.senderId as any)._id?.toString() === candidateUser._id.toString(),
      "createMessage successfully persists and populates message document"
    );

    const msg2 = await createMessage(
      activeConversation._id.toString(),
      candidateUser._id.toString(),
      "Here is my updated portfolio link as well."
    );

    // 5.2 Delete For Me (Candidate deletes msg2 for themselves)
    await deleteMessage(msg2._id.toString(), candidateUser._id.toString(), false);

    const candMessagesAfterDeleteForMe: any = await getConversationMessages(
      activeConversation._id.toString(),
      candidateUser._id.toString()
    );
    const recMessagesAfterDeleteForMe: any = await getConversationMessages(
      activeConversation._id.toString(),
      recruiterUser._id.toString()
    );

    const candList = candMessagesAfterDeleteForMe.data || candMessagesAfterDeleteForMe.items || candMessagesAfterDeleteForMe;
    const recList = recMessagesAfterDeleteForMe.data || recMessagesAfterDeleteForMe.items || recMessagesAfterDeleteForMe;

    assert(
      candList.length === 1 && recList.length === 2,
      "Delete for Me hides message from deleter while leaving it visible for counterparty"
    );

    // 5.3 Delete For Everyone (Candidate deletes msg1 for everyone)
    await deleteMessage(msg1._id.toString(), candidateUser._id.toString(), true);

    const candMessagesAfterDeleteAll: any = await getConversationMessages(
      activeConversation._id.toString(),
      candidateUser._id.toString()
    );
    const candAllList = candMessagesAfterDeleteAll.data || candMessagesAfterDeleteAll.items || candMessagesAfterDeleteAll;
    const deletedMsgBody = candAllList.find((m: any) => m._id.toString() === msg1._id.toString())?.message;

    assert(
      deletedMsgBody?.includes("This message was deleted"),
      "Delete for Everyone masks message content with system placeholder across all participants"
    );

    // =========================================================================
    // [6] UNREAD COUNT & DELETEDFOR EXCLUSION (P1 FIX)
    // =========================================================================
    console.log("\n--- [6] Unread Counts & deletedFor Exclusion (P1 Fix) ---");

    // Reset baseline by marking previous messages as read
    await markConversationMessagesAsRead(activeConversation._id.toString(), recruiterUser._id.toString());
    const initialBaseline = await getUnreadChatCount(recruiterUser._id.toString());
    assert(initialBaseline === 0, "Initial unread count baseline is 0 after clearing read messages");

    // Send new unread message from Candidate to Recruiter
    const unreadMsg = await createMessage(
      activeConversation._id.toString(),
      candidateUser._id.toString(),
      "Unread inquiry message"
    );

    // Recruiter unread count should be 1
    const recUnreadInitial = await getUnreadChatCount(recruiterUser._id.toString());
    assert(recUnreadInitial === 1, "getUnreadChatCount returns 1 for incoming unread message");

    // Recruiter deletes unread message for themselves
    await deleteMessage(unreadMsg._id.toString(), recruiterUser._id.toString(), false);

    // Recruiter unread count should now be 0 (P1 fix verified: deletedFor excluded)
    const recUnreadAfterDeleteForMe = await getUnreadChatCount(recruiterUser._id.toString());
    assert(
      recUnreadAfterDeleteForMe === 0,
      "getUnreadChatCount correctly excludes messages deleted via 'Delete for Me' from unread badge"
    );

    // =========================================================================
    // [7] MARK-AS-READ AUTHORIZATION (P1 FIX)
    // =========================================================================
    console.log("\n--- [7] Mark As Read Authorization (P1 Fix) ---");

    const newMsgForRead = await createMessage(
      activeConversation._id.toString(),
      candidateUser._id.toString(),
      "Another message to test mark as read"
    );

    // 7.1 Unauthorized outsider attempts mark read -> Should throw 403 Forbidden
    let outsiderMarkReadBlocked = false;
    try {
      await markConversationMessagesAsRead(activeConversation._id.toString(), outsiderCandidate._id.toString());
    } catch (e: any) {
      outsiderMarkReadBlocked = e.statusCode === 403;
    }
    assert(outsiderMarkReadBlocked, "Unauthorized outsider is blocked from marking messages as read (403 Forbidden)");

    // 7.2 Authorized recipient marks as read
    const markReadResult = await markConversationMessagesAsRead(activeConversation._id.toString(), recruiterUser._id.toString());
    assert(markReadResult.updatedCount >= 1, "Authorized participant successfully marks conversation messages as read");

    const updatedMsg = await Message.findById(newMsgForRead._id);
    assert(updatedMsg?.isRead === true, "Message isRead flag is successfully persisted as true in MongoDB");

    // =========================================================================
    // [8] MESSAGE PAGINATION & INDEX VERIFICATION (P2 FIX)
    // =========================================================================
    console.log("\n--- [8] Message Pagination & Compound Index (P2 Fix) ---");

    // Seed 10 sequential messages
    for (let i = 1; i <= 10; i++) {
      await createMessage(
        activeConversation._id.toString(),
        candidateUser._id.toString(),
        `Pagination test message #${i}`
      );
    }

    const page1: any = await getConversationMessages(activeConversation._id.toString(), candidateUser._id.toString(), {
      page: "1",
      limit: "5",
    });

    const page2: any = await getConversationMessages(activeConversation._id.toString(), candidateUser._id.toString(), {
      page: "2",
      limit: "5",
    });

    const p1Items = page1.data || page1.items || page1;
    const p2Items = page2.data || page2.items || page2;
    const p1Page = page1.pagination?.page || page1.pagination?.currentPage;
    const p2Page = page2.pagination?.page || page2.pagination?.currentPage;

    assert(
      p1Items.length === 5 &&
      p2Items.length === 5 &&
      p1Page === 1 &&
      p2Page === 2,
      "Message pagination returns correct page slice and pagination metadata with lean compound index"
    );

  } finally {
    // Cleanup fixtures
    console.log("\n Cleaning up test fixtures...");
    await User.deleteMany({ email: { $regex: testSuffix } });
    await RecruiterProfile.deleteMany({ designation: "Lead Recruiter" });
    await CandidateProfile.deleteMany({ skills: { $in: ["React", "Python"] } });
    await Company.deleteMany({ name: { $regex: testSuffix } });
    await CompanyRecruiter.deleteMany({ role: "owner" });
    await Job.deleteMany({ title: { $regex: testSuffix } });
    await Application.deleteMany({ status: APPLICATION_STATUS.APPLIED });
    await Conversation.deleteMany({ jobId: { $exists: true } });
    await Message.deleteMany({ message: { $regex: "Fullstack|Pagination|portfolio|Unread|inquiry" } });

    console.log("================================================================");
    console.log(`   TOTAL TESTS RUN: ${passed + failed}`);
    console.log(`   PASSED: ${passed}`);
    console.log(`   FAILED: ${failed}`);
    console.log("================================================================");

    await mongoose.disconnect();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runChatLifecycleTests().catch((err) => {
  console.error("Test Suite crashed with unhandled error:", err);
  process.exit(1);
});
