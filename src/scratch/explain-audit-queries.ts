import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/user.model";
import CandidateProfile from "../models/candidate-profile.model";
import RecruiterProfile from "../models/recruiter-profile.model";
import Company from "../models/company.model";
import CompanyRecruiter from "../models/company-recruiter.model";
import Job from "../models/job.model";
import Application from "../models/application.model";
import Post from "../models/post.model";
import PostComment from "../models/post-comment.model";
import Notification from "../models/notification.model";
import Conversation from "../models/conversation.model";
import Message from "../models/message.model";
import Subscription from "../models/subscription.model";
import PaymentTransaction from "../models/payment-transaction.model";

async function runExplainBenchmark() {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal";
  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB for Query Explain Analysis");

  const dummyId1 = new Types.ObjectId();
  const dummyId2 = new Types.ObjectId();
  const dummyId3 = new Types.ObjectId();

  const results: any[] = [];

  async function explainQuery(name: string, collection: string, queryPromise: any) {
    try {
      const explanation = await queryPromise.explain("executionStats");
      const stats = explanation.executionStats || {};
      const stage = explanation.queryPlanner?.winningPlan?.stage || "UNKNOWN";
      const inputStage = explanation.queryPlanner?.winningPlan?.inputStage?.stage || "";
      const indexName = explanation.queryPlanner?.winningPlan?.inputStage?.indexName || 
                        explanation.queryPlanner?.winningPlan?.indexName || 
                        explanation.queryPlanner?.winningPlan?.inputStage?.inputStage?.indexName || 
                        "COLLSCAN / NONE";

      results.push({
        name,
        collection,
        executionTimeMillis: stats.executionTimeMillis,
        totalKeysExamined: stats.totalKeysExamined,
        totalDocsExamined: stats.totalDocsExamined,
        nReturned: stats.nReturned,
        winningPlan: stage === "IXSCAN" || inputStage === "IXSCAN" ? `IXSCAN (${indexName})` : stage,
        indexUsed: indexName,
      });
    } catch (err: any) {
      results.push({
        name,
        collection,
        error: err.message,
      });
    }
  }

  // 1. CompanyRecruiter lookup by recruiterProfileId
  await explainQuery(
    "1. Recruiter Authorization by recruiterProfileId",
    "CompanyRecruiter",
    CompanyRecruiter.findOne({ recruiterProfileId: dummyId1, isDeleted: false })
  );

  // 2. Job Feed Filter + Sort
  await explainQuery(
    "2. Public Job Feed (status + isDeleted + sort featured/createdAt)",
    "Job",
    Job.find({ status: "ACTIVE", isDeleted: false }).sort({ isFeatured: -1, createdAt: -1 }).skip(0).limit(10)
  );

  // 3. Recruiter My Jobs
  await explainQuery(
    "3. Recruiter My Jobs (recruiterId + isDeleted + sort createdAt)",
    "Job",
    Job.find({ recruiterId: dummyId1, isDeleted: false }).sort({ createdAt: -1 })
  );

  // 4. Candidate Applications
  await explainQuery(
    "4. Candidate My Applications (applicantId + isDeleted + sort createdAt)",
    "Application",
    Application.find({ applicantId: dummyId1, isDeleted: false }).sort({ createdAt: -1 })
  );

  // 5. Recruiter Job Applications
  await explainQuery(
    "5. Recruiter Job Applications (jobId + isDeleted + sort createdAt)",
    "Application",
    Application.find({ jobId: dummyId1, isDeleted: false }).sort({ createdAt: -1 })
  );

  // 6. Post Global Feed
  await explainQuery(
    "6. Post Global Feed (isPublished + isDeleted + sort createdAt)",
    "Post",
    Post.find({ isPublished: true, isDeleted: false }).sort({ createdAt: -1 }).skip(0).limit(10)
  );

  // 7. Post Comments
  await explainQuery(
    "7. Post Comment Replies (postId + parentCommentId + isDeleted + sort createdAt)",
    "PostComment",
    PostComment.find({ postId: dummyId1, parentCommentId: dummyId2, isDeleted: false }).sort({ createdAt: 1 })
  );

  // 8. Notification Feed
  await explainQuery(
    "8. Notification Feed (recipientId + isRead + sort createdAt)",
    "Notification",
    Notification.find({ recipientId: dummyId1, isRead: false }).sort({ createdAt: -1 }).skip(0).limit(10)
  );

  // 9. Conversation $or lookup
  await explainQuery(
    "9. User Conversations ($or candidateId/recruiterId + isDeleted + sort lastMessageAt)",
    "Conversation",
    Conversation.find({ $or: [{ candidateId: dummyId1 }, { recruiterId: dummyId1 }], isDeleted: false }).sort({ lastMessageAt: -1 })
  );

  // 10. Message History Pagination
  await explainQuery(
    "10. Message History Pagination (conversationId + deletedFor $ne + sort createdAt)",
    "Message",
    Message.find({ conversationId: dummyId1, deletedFor: { $ne: dummyId2 } }).sort({ createdAt: -1 }).skip(0).limit(20)
  );

  // 11. User Subscription Status
  await explainQuery(
    "11. Subscription Active Lookup (userId + status $in + sort createdAt)",
    "Subscription",
    Subscription.findOne({ userId: dummyId1, status: { $in: ["active", "past_due"] } }).sort({ createdAt: -1 })
  );

  // 12. PaymentTransaction Idempotency Lookup
  await explainQuery(
    "12. PaymentTransaction Idempotency ($or transactionId / providerPaymentId / providerOrderId)",
    "PaymentTransaction",
    PaymentTransaction.findOne({ $or: [{ transactionId: "txn_test" }, { providerPaymentId: "pay_test" }] })
  );

  console.log("\n================ EXPLAIN RESULTS ================");
  console.log(JSON.stringify(results, null, 2));

  await mongoose.disconnect();
}

runExplainBenchmark().catch(console.error);
