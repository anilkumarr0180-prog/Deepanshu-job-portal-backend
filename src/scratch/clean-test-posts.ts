import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/user.model";
import Post from "../models/post.model";
import PostComment from "../models/post-comment.model";
import PostReaction from "../models/post-reaction.model";
import Notification from "../models/notification.model";

async function inspectAndCleanTestPosts() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal";
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB");

  // Find test users with reply_ or test prefixes
  const testUsers = await User.find({
    $or: [
      { email: { $regex: /reply_|test|author_|commenter_|replier_/i } },
      { name: { $regex: /reply_|Post Author reply_/i } },
    ],
  });

  const testUserIds = testUsers.map((u) => u._id);
  console.log(`Found ${testUsers.length} test users.`);

  // Find posts by test users or containing test content
  const testPosts = await Post.find({
    $or: [
      { authorId: { $in: testUserIds } },
      { content: "Excited to share insights on engineering best practices!" },
    ],
  });

  const testPostIds = testPosts.map((p) => p._id);
  console.log(`Found ${testPosts.length} test posts.`);

  // Clean them up
  if (testPostIds.length > 0) {
    const deletedComments = await PostComment.deleteMany({ postId: { $in: testPostIds } });
    const deletedReactions = await PostReaction.deleteMany({ postId: { $in: testPostIds } });
    const deletedPosts = await Post.deleteMany({ _id: { $in: testPostIds } });
    console.log(`Deleted ${deletedPosts.deletedCount} test posts, ${deletedComments.deletedCount} comments, ${deletedReactions.deletedCount} reactions.`);
  }

  if (testUserIds.length > 0) {
    const deletedNotifications = await Notification.deleteMany({
      $or: [{ recipientId: { $in: testUserIds } }, { senderId: { $in: testUserIds } }],
    });
    const deletedUsers = await User.deleteMany({ _id: { $in: testUserIds } });
    console.log(`Deleted ${deletedUsers.deletedCount} test users, ${deletedNotifications.deletedCount} test notifications.`);
  }

  // Check remaining posts
  const remainingPosts = await Post.find().populate("authorId", "name email");
  console.log(`Remaining posts count: ${remainingPosts.length}`);
  for (const p of remainingPosts) {
    console.log(`- Post: "${p.content}" by ${(p.authorId as any)?.name || "unknown"}`);
  }

  await mongoose.disconnect();
}

inspectAndCleanTestPosts().catch(console.error);
