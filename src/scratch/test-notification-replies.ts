import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/user.model";
import Post from "../models/post.model";
import PostComment from "../models/post-comment.model";
import Notification from "../models/notification.model";
import { USER_ROLES } from "../constants/roles";
import { createPostComment, getPostComments } from "../services/post-comment.service";
import { NOTIFICATION_TYPES } from "../constants/notification-type";

async function runNotificationReplyTests() {
  console.log("================================================================");
  console.log("       NOTIFICATION & COMMENT/REPLY TEST SUITE                  ");
  console.log("================================================================");

  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal";
  await mongoose.connect(mongoUri);
  console.log(" Connected to MongoDB");

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

  const testSuffix = `reply_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  try {
    // 1. Create Post Author
    const author: any = await User.create({
      name: `Post Author ${testSuffix}`,
      email: `author_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.CANDIDATE,
      isEmailVerified: true,
    });

    // 2. Create Commenter User
    const commenter: any = await User.create({
      name: `Commenter User ${testSuffix}`,
      email: `commenter_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.CANDIDATE,
      isEmailVerified: true,
    });

    // 3. Create Replier User
    const replier: any = await User.create({
      name: `Replier User ${testSuffix}`,
      email: `replier_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.RECRUITER,
      isEmailVerified: true,
    });

    // 4. Create Post
    const post: any = await Post.create({
      authorId: author._id,
      content: "Excited to share insights on engineering best practices!",
      isPublished: true,
      isDeleted: false,
    });

    // 5. Create Root Comment
    const rootComment = await createPostComment(post._id.toString(), commenter._id.toString(), {
      content: "Great post! Looking forward to more.",
    });
    assert(rootComment && rootComment.content === "Great post! Looking forward to more.", "1. Root comment created successfully");

    // Check notification sent to author
    const authorNotification = await Notification.findOne({
      recipientId: author._id,
      type: NOTIFICATION_TYPES.POST_COMMENTED,
    });
    assert(Boolean(authorNotification), "2. Notification sent to post author for root comment");

    // 6. Create Reply to Root Comment
    const replyComment = await createPostComment(post._id.toString(), replier._id.toString(), {
      content: "Totally agree with this!",
      parentCommentId: rootComment._id.toString(),
    });
    assert(replyComment && replyComment.parentCommentId.toString() === rootComment._id.toString(), "3. Reply created with parentCommentId");

    // Check notification sent to original commenter
    const replyNotification = await Notification.findOne({
      recipientId: commenter._id,
      type: NOTIFICATION_TYPES.COMMENT_REPLIED,
    });
    assert(Boolean(replyNotification), "4. Notification sent to commenter for reply");

    // 7. Get Comments tree
    const commentsResult = await getPostComments(post._id.toString(), { page: 1, limit: 10 });
    const commentsList = (commentsResult as any).items || (commentsResult as any).data || commentsResult;
    assert(Array.isArray(commentsList) && commentsList.length > 0, "5. Post comments retrieved successfully");

    console.log("\n================================================================");
    console.log(` SUMMARY: Passed: ${passed} | Failed: ${failed}`);
    console.log("================================================================");
  } finally {
    // Clean up test fixtures created by this run
    try {
      await PostComment.deleteMany({
        content: { $in: ["Great post! Looking forward to more.", "Totally agree with this!"] },
      });
      await Post.deleteMany({
        content: "Excited to share insights on engineering best practices!",
      });
      await Notification.deleteMany({
        type: { $in: [NOTIFICATION_TYPES.POST_COMMENTED, NOTIFICATION_TYPES.COMMENT_REPLIED] },
      });
      await User.deleteMany({
        email: { $regex: new RegExp(`_${testSuffix}@example\\.com$`) },
      });
    } catch (_) {}

    await mongoose.disconnect();
    console.log(" Disconnected from MongoDB");
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runNotificationReplyTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
