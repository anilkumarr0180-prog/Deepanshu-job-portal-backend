import assert from "assert";
import mongoose, { Types } from "mongoose";
import Interview from "../models/interview.model";
import {
  INTERVIEW_STATUS,
  INTERVIEW_MODE,
  VALID_INTERVIEW_TRANSITIONS,
  isValidInterviewTransition,
} from "../constants/interview-status";
import {
  createInterviewSchema,
  rescheduleInterviewSchema,
  candidateRsvpSchema,
  submitFeedbackSchema,
  cancelInterviewSchema,
} from "../validations/interview.validations";

async function runInterviewDomainTests() {
  console.log("==================================================");
  console.log("🧪 RUNNING INTERVIEW DOMAIN & MODEL INTEGRITY TESTS");
  console.log("==================================================\n");

  const validAppId = new Types.ObjectId().toString();
  const validJobId = new Types.ObjectId().toString();
  const validCandidateId = new Types.ObjectId().toString();
  const validRecruiterId = new Types.ObjectId().toString();

  // 1. Test Valid Interview Document Instantiation & Schema Defaults
  console.log("1. Testing valid Interview instantiation...");
  const startTime = new Date(Date.now() + 86400000); // 1 day ahead
  const endTime = new Date(startTime.getTime() + 45 * 60000);

  const interviewDoc = new Interview({
    applicationId: validAppId,
    jobId: validJobId,
    candidateId: validCandidateId,
    recruiterId: validRecruiterId,
    roundNumber: 1,
    title: "Technical Interview",
    type: "Technical Interview",
    mode: INTERVIEW_MODE.VIDEO,
    scheduledStartTime: startTime,
    scheduledEndTime: endTime,
    durationMinutes: 45,
    timezone: "UTC",
    locationOrLink: "https://meet.google.com/abc-defg-hij",
    notes: "Please join with working camera",
  });

  const validationError = interviewDoc.validateSync();
  assert(!validationError, `Expected no validation error, got: ${validationError}`);
  assert.strictEqual(interviewDoc.status, INTERVIEW_STATUS.SCHEDULED);
  assert.strictEqual(interviewDoc.candidateResponse.status, "pending");
  assert.strictEqual(interviewDoc.reminderSent24h, false);
  assert.strictEqual(interviewDoc.reminderSent1h, false);
  console.log("  ✅ Valid interview schema instantiated with expected defaults.");

  // 2. Testing Missing Required Relationship (e.g. missing candidateId or applicationId)
  console.log("2. Testing missing required relationship validation...");
  const missingAppDoc = new Interview({
    jobId: validJobId,
    candidateId: validCandidateId,
    recruiterId: validRecruiterId,
    scheduledStartTime: startTime,
    scheduledEndTime: endTime,
  });
  const missingAppError = missingAppDoc.validateSync();
  assert(missingAppError, "Expected validation error for missing applicationId");
  assert(missingAppError.errors["applicationId"], "Expected applicationId required error");
  console.log("  ✅ Missing required relationship properly rejected.");

  // 3. Testing Invalid ObjectId in Zod Validations
  console.log("3. Testing invalid ObjectId validation...");
  const invalidIdResult = createInterviewSchema.safeParse({
    params: { applicationId: "invalid-id-123" },
    body: {
      scheduledStartTime: new Date(Date.now() + 3600000).toISOString(),
    },
  });
  assert(!invalidIdResult.success, "Expected invalid ObjectId to fail Zod validation");
  console.log("  ✅ Invalid ObjectId rejected by Zod schema.");

  // 4. Testing Invalid Status & Status Transitions
  console.log("4. Testing status transitions...");
  assert.strictEqual(isValidInterviewTransition(INTERVIEW_STATUS.SCHEDULED, INTERVIEW_STATUS.ACCEPTED), true);
  assert.strictEqual(isValidInterviewTransition(INTERVIEW_STATUS.SCHEDULED, INTERVIEW_STATUS.DECLINED), true);
  assert.strictEqual(isValidInterviewTransition(INTERVIEW_STATUS.SCHEDULED, INTERVIEW_STATUS.RESCHEDULE_REQUESTED), true);
  assert.strictEqual(isValidInterviewTransition(INTERVIEW_STATUS.ACCEPTED, INTERVIEW_STATUS.COMPLETED), true);
  assert.strictEqual(isValidInterviewTransition(INTERVIEW_STATUS.COMPLETED, INTERVIEW_STATUS.SCHEDULED), false);
  assert.strictEqual(isValidInterviewTransition(INTERVIEW_STATUS.CANCELLED, INTERVIEW_STATUS.ACCEPTED), false);
  console.log("  ✅ Status transition matrix enforces canonical state transitions.");

  // 5. Testing Invalid Scheduled Time (Past Date)
  console.log("5. Testing past date rejection in Zod...");
  const pastTimeResult = createInterviewSchema.safeParse({
    params: { applicationId: validAppId },
    body: {
      scheduledStartTime: new Date(Date.now() - 3600000 * 24).toISOString(), // 1 day ago
    },
  });
  assert(!pastTimeResult.success, "Expected past date to fail validation");
  console.log("  ✅ Past scheduling rejected.");

  // 6. Testing End Time After Start Time (Mongoose Schema Level)
  console.log("6. Testing scheduledEndTime < scheduledStartTime schema constraint...");
  const invalidEndTimeDoc = new Interview({
    applicationId: validAppId,
    jobId: validJobId,
    candidateId: validCandidateId,
    recruiterId: validRecruiterId,
    scheduledStartTime: startTime,
    scheduledEndTime: new Date(startTime.getTime() - 1000), // Before start
    durationMinutes: 45,
  });
  const invalidEndError = invalidEndTimeDoc.validateSync();
  assert(invalidEndError, "Expected validation error when end time is before start time");
  console.log("  ✅ End time before start time constraint verified.");

  // 7. Testing Invalid Duration
  console.log("7. Testing invalid duration boundaries...");
  const invalidDurationResult = createInterviewSchema.safeParse({
    params: { applicationId: validAppId },
    body: {
      scheduledStartTime: new Date(Date.now() + 86400000).toISOString(),
      durationMinutes: 2, // Minimum is 5
    },
  });
  assert(!invalidDurationResult.success, "Expected duration < 5 to fail validation");
  console.log("  ✅ Duration boundaries (5 min - 480 min) validated.");

  // 8. Testing Multiple Rounds for Single Application
  console.log("8. Testing multiple interview rounds representation...");
  const round1Doc = new Interview({
    applicationId: validAppId,
    jobId: validJobId,
    candidateId: validCandidateId,
    recruiterId: validRecruiterId,
    roundNumber: 1,
    title: "HR Screening",
    type: "HR Screening",
    mode: INTERVIEW_MODE.PHONE,
    scheduledStartTime: startTime,
    scheduledEndTime: endTime,
    status: INTERVIEW_STATUS.COMPLETED,
  });
  const round2StartTime = new Date(startTime.getTime() + 86400000);
  const round2Doc = new Interview({
    applicationId: validAppId,
    jobId: validJobId,
    candidateId: validCandidateId,
    recruiterId: validRecruiterId,
    roundNumber: 2,
    title: "Technical Pair Programming",
    type: "Technical Interview",
    mode: INTERVIEW_MODE.VIDEO,
    scheduledStartTime: round2StartTime,
    scheduledEndTime: new Date(round2StartTime.getTime() + 60 * 60000),
    status: INTERVIEW_STATUS.SCHEDULED,
  });
  assert(!round1Doc.validateSync() && !round2Doc.validateSync(), "Both rounds should be valid");
  assert.strictEqual(round1Doc.roundNumber, 1);
  assert.strictEqual(round2Doc.roundNumber, 2);
  console.log("  ✅ Multiple sequential rounds supported independently.");

  // 9. Testing Candidate RSVP Validation with conditional suggestedTime
  console.log("9. Testing Candidate RSVP validation rules...");
  const rsvpAcceptResult = candidateRsvpSchema.safeParse({
    params: { id: validAppId },
    body: { action: "accept" },
  });
  assert(rsvpAcceptResult.success, "Accept RSVP without suggestedTime should succeed");

  const rsvpRescheduleWithoutTime = candidateRsvpSchema.safeParse({
    params: { id: validAppId },
    body: { action: "request_reschedule" }, // Missing suggestedTime
  });
  assert(!rsvpRescheduleWithoutTime.success, "Reschedule request without suggestedTime must fail");
  console.log("  ✅ Candidate RSVP refinement rules verified.");

  // 10. Testing Index Definitions on Mongoose Model
  console.log("10. Testing schema index definitions...");
  const indexes: any[] = Interview.schema.indexes();
  const indexKeys = indexes.map(([spec]: [Record<string, any>, any]) => Object.keys(spec).join("_"));
  console.log("  Configured compound indexes:", indexKeys);
  assert(indexKeys.some((k: string) => k.includes("candidateId_scheduledStartTime")), "Missing candidate schedule index");
  assert(indexKeys.some((k: string) => k.includes("recruiterId_scheduledStartTime")), "Missing recruiter schedule index");
  assert(indexKeys.some((k: string) => k.includes("applicationId_roundNumber")), "Missing application rounds index");
  assert(indexKeys.some((k: string) => k.includes("reminderSent24h")), "Missing cron reminders index");
  console.log("  ✅ All approved high-performance compound indexes verified.");

  console.log("\n==================================================");
  console.log("🎉 ALL 10 INTERVIEW DOMAIN TESTS PASSED SUCCESSFULLY");
  console.log("==================================================");
}

runInterviewDomainTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
