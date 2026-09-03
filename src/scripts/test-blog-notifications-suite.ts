import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/database";
import User from "../models/user.model";
import Connection from "../models/connection.model";
import BlogCategory from "../models/blog-category.model";
import Blog from "../models/blog.model";
import Notification from "../models/notification.model";
import * as blogService from "../services/blog.service";
import * as connectionService from "../services/connection.service";
import * as notificationService from "../services/notification.service";
import { BLOG_STATUS } from "../constants/blog-status";
import { NOTIFICATION_TYPES } from "../constants/notification-type";
import { USER_ROLES } from "../constants/roles";

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, num: number, name: string, details?: string) {
  if (condition) {
    results.push({ num, name, passed: true, details });
    console.log(`  ✅ [PASS] Test ${num}: ${name}`);
  } else {
    results.push({ num, name, passed: false, error: "Assertion failed", details });
    console.error(`  ❌ [FAIL] Test ${num}: ${name} - Details: ${details || "None"}`);
  }
}

async function runTestSuite() {
  console.log("===============================================================");
  console.log(" STARTING CONNECTED USERS BLOG NOTIFICATIONS TEST SUITE ");
  console.log("===============================================================\n");

  await connectDB();

  // 1. Create or retrieve test users
  const ensureUser = async (name: string, email: string) => {
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name,
        email,
        password: "TestPassword123!",
        role: USER_ROLES.CANDIDATE,
        isEmailVerified: true,
        authProvider: "local",
      });
    }
    return user;
  };

  const userA = await ensureUser("User A (Author)", "notif-author-a@jobbox-test.com");
  const userB = await ensureUser("User B (Accepted 1)", "notif-connected-b@jobbox-test.com");
  const userC = await ensureUser("User C (Accepted 2)", "notif-connected-c@jobbox-test.com");
  const userD = await ensureUser("User D (Pending)", "notif-pending-d@jobbox-test.com");
  const userE = await ensureUser("User E (Rejected)", "notif-rejected-e@jobbox-test.com");
  const userF = await ensureUser("User F (Unconnected)", "notif-stranger-f@jobbox-test.com");

  const authorId = userA._id.toString();
  const userBId = userB._id.toString();
  const userCId = userC._id.toString();
  const userDId = userD._id.toString();
  const userEId = userE._id.toString();
  const userFId = userF._id.toString();

  const allTestUserIds = [authorId, userBId, userCId, userDId, userEId, userFId];

  // 2. Clean previous test data
  await Connection.deleteMany({
    $or: [
      { requesterId: { $in: allTestUserIds } },
      { recipientId: { $in: allTestUserIds } },
    ],
  });

  await Notification.deleteMany({
    recipientId: { $in: allTestUserIds },
  });

  await Blog.deleteMany({
    authorId: { $in: allTestUserIds },
  });

  // Ensure BlogCategory
  let category = await BlogCategory.findOne({ isDeleted: false });
  if (!category) {
    category = await BlogCategory.create({
      name: "Engineering & Tech",
      slug: "engineering-tech",
      description: "Software engineering insights",
      isDeleted: false,
    });
  }

  // 3. Setup Connection relationships:
  // A -> B: accepted (A requester, B recipient)
  await Connection.create({
    requesterId: userA._id,
    recipientId: userB._id,
    status: "accepted",
    acceptedAt: new Date(),
  });

  // C -> A: accepted (C requester, A recipient - tests reverse direction)
  await Connection.create({
    requesterId: userC._id,
    recipientId: userA._id,
    status: "accepted",
    acceptedAt: new Date(),
  });

  // A -> D: pending
  await Connection.create({
    requesterId: userA._id,
    recipientId: userD._id,
    status: "pending",
  });

  // A -> E: rejected
  await Connection.create({
    requesterId: userA._id,
    recipientId: userE._id,
    status: "rejected",
  });

  // Verify getAcceptedConnectionUserIds lookup
  const acceptedIds = await connectionService.getAcceptedConnectionUserIds(authorId);
  assert(
    acceptedIds.length === 2 && acceptedIds.includes(userBId) && acceptedIds.includes(userCId) && !acceptedIds.includes(authorId),
    1,
    "Connection lookup returns strictly accepted peer IDs (bidirectional) and excludes author",
    `Accepted IDs: ${JSON.stringify(acceptedIds)}`
  );

  // 4. Test Case 1-5: Create draft blog, then publish it
  console.log("\n--- Testing Draft Creation & Publication ---");
  const draftBlog = await blogService.createCandidateBlog(
    {
      title: "How to Prepare for a React Interview",
      excerpt: "A comprehensive guide to preparing for senior React frontend engineering roles.",
      content: "Deep dive into React 19, Hooks, Server Components, and State Architecture.",
      categoryId: category._id.toString(),
      status: BLOG_STATUS.DRAFT,
    },
    authorId
  );

  // Check no notifications on draft creation
  const draftNotifCount = await Notification.countDocuments({
    recipientId: { $in: allTestUserIds },
  });
  assert(draftNotifCount === 0, 2, "No notifications sent when creating a draft blog");

  // Publish the blog
  const publishedBlog = await blogService.publishCandidateBlog(
    draftBlog._id.toString(),
    authorId
  );

  if (!publishedBlog) {
    throw new Error("Failed to publish blog");
  }

  assert(publishedBlog.status === BLOG_STATUS.PUBLISHED, 3, "Blog status transitioned to PUBLISHED");

  // Allow async tasks a moment
  await new Promise((r) => setTimeout(r, 300));

  // Check notifications across all users:
  const notifA = await Notification.find({ recipientId: authorId, type: NOTIFICATION_TYPES.BLOG_PUBLISHED });
  const notifB = await Notification.find({ recipientId: userBId, type: NOTIFICATION_TYPES.BLOG_PUBLISHED });
  const notifC = await Notification.find({ recipientId: userCId, type: NOTIFICATION_TYPES.BLOG_PUBLISHED });
  const notifD = await Notification.find({ recipientId: userDId, type: NOTIFICATION_TYPES.BLOG_PUBLISHED });
  const notifE = await Notification.find({ recipientId: userEId, type: NOTIFICATION_TYPES.BLOG_PUBLISHED });
  const notifF = await Notification.find({ recipientId: userFId, type: NOTIFICATION_TYPES.BLOG_PUBLISHED });

  assert(notifA.length === 0, 4, "Author (User A) receives NO notification for their own blog");
  assert(notifB.length === 1, 5, "Accepted connection (User B) receives exactly 1 notification");
  assert(notifC.length === 1, 6, "Accepted connection (User C, reverse direction) receives exactly 1 notification");
  assert(notifD.length === 0, 7, "Pending connection (User D) receives NO notification");
  assert(notifE.length === 0, 8, "Rejected connection (User E) receives NO notification");
  assert(notifF.length === 0, 9, "Unconnected user (User F) receives NO notification");

  // Verify Notification payload structure
  const notifBDoc = notifB[0];
  assert(
    notifBDoc.title === "New Blog from Your Connection" &&
    notifBDoc.body.includes("How to Prepare for a React Interview") &&
    notifBDoc.link === `/blog/${publishedBlog.slug}` &&
    (notifBDoc.metadata as any)?.blogId === publishedBlog._id.toString() &&
    (notifBDoc.metadata as any)?.slug === publishedBlog.slug &&
    (notifBDoc.metadata as any)?.authorId === authorId,
    10,
    "Notification payload has exact required fields and metadata"
  );

  // 5. Test Case 6: Duplicate Publish Prevention
  console.log("\n--- Testing Duplicate Protection on Repeated Publish ---");
  await blogService.publishCandidateBlog(publishedBlog._id.toString(), authorId);
  await new Promise((r) => setTimeout(r, 200));

  const notifBAfterDup = await Notification.find({ recipientId: userBId, type: NOTIFICATION_TYPES.BLOG_PUBLISHED });
  const notifCAfterDup = await Notification.find({ recipientId: userCId, type: NOTIFICATION_TYPES.BLOG_PUBLISHED });

  assert(notifBAfterDup.length === 1, 11, "User B still has exactly 1 notification after second publish call (deduplicated)");
  assert(notifCAfterDup.length === 1, 12, "User C still has exactly 1 notification after second publish call (deduplicated)");

  // 6. Test Case 7: Editing an already published blog
  console.log("\n--- Testing Edit on Published Blog ---");
  await blogService.updateCandidateBlog(
    publishedBlog._id.toString(),
    {
      title: "How to Prepare for a React Interview - Updated Edition",
      content: "Added performance benchmarking and Concurrent Mode tips.",
    },
    authorId
  );
  await new Promise((r) => setTimeout(r, 200));

  const notifBAfterEdit = await Notification.find({ recipientId: userBId, type: NOTIFICATION_TYPES.BLOG_PUBLISHED });
  assert(notifBAfterEdit.length === 1, 13, "No new notifications dispatched when editing an already published blog");

  // 7. Test Direct Publish on Creation (Admin/Candidate create with published status)
  console.log("\n--- Testing Direct Publish on Blog Creation ---");
  const directPublishedBlog = await blogService.createCandidateBlog(
    {
      title: "Mastering Node.js Microservices",
      excerpt: "Production architectural patterns for Node.js microservices.",
      content: "Building scalable distributed systems with Redis and BullMQ.",
      categoryId: category._id.toString(),
      status: BLOG_STATUS.PUBLISHED,
    },
    authorId
  );
  await new Promise((r) => setTimeout(r, 200));

  const notifBDirect = await Notification.find({
    recipientId: userBId,
    "metadata.blogId": directPublishedBlog._id.toString(),
  });
  const notifCDirect = await Notification.find({
    recipientId: userCId,
    "metadata.blogId": directPublishedBlog._id.toString(),
  });
  const notifFDirect = await Notification.find({
    recipientId: userFId,
    "metadata.blogId": directPublishedBlog._id.toString(),
  });

  assert(notifBDirect.length === 1, 14, "Direct published blog triggers notification to connected User B");
  assert(notifCDirect.length === 1, 15, "Direct published blog triggers notification to connected User C");
  assert(notifFDirect.length === 0, 16, "Direct published blog does NOT notify unconnected User F");

  // 8. Test Admin publishing flow
  console.log("\n--- Testing Admin Blog Publishing Flow ---");
  const adminDraft = await blogService.createBlog(
    {
      title: "JobsBox 2026 Engineering Platform Roadmap",
      excerpt: "Announcement of upcoming features and APIs.",
      content: "Roadmap details for platform scale.",
      categoryId: category._id.toString(),
      status: BLOG_STATUS.DRAFT,
    },
    authorId
  );

  await blogService.publishBlog(adminDraft._id.toString());
  await new Promise((r) => setTimeout(r, 200));

  const notifBAdmin = await Notification.find({
    recipientId: userBId,
    "metadata.blogId": adminDraft._id.toString(),
  });
  assert(notifBAdmin.length === 1, 17, "Admin publishBlog flow generates notification to accepted connection");

  // 9. Test unread count calculation and persistence (Case 9 & 10)
  console.log("\n--- Testing Unread Count & Persistence ---");
  const unreadCountB = await notificationService.getUnreadCount(userBId);
  assert(unreadCountB >= 3, 18, `Unread count for User B is accurate (${unreadCountB}) and persisted in MongoDB`);

  // Cleanup test records
  await Connection.deleteMany({
    $or: [
      { requesterId: { $in: allTestUserIds } },
      { recipientId: { $in: allTestUserIds } },
    ],
  });

  await Notification.deleteMany({
    recipientId: { $in: allTestUserIds },
  });

  await Blog.deleteMany({
    authorId: { $in: allTestUserIds },
  });

  console.log("\n===============================================================");
  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(` SUITE SUMMARY: ${passedCount}/${totalCount} TESTS PASSED`);
  console.log("===============================================================\n");

  if (passedCount !== totalCount) {
    process.exit(1);
  }
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error("Test Suite crashed with unhandled error:", err);
  process.exit(1);
});
