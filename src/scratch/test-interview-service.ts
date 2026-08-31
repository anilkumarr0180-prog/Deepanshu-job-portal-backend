import assert from "assert";
import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/database";
import User from "../models/user.model";
import Job from "../models/job.model";
import Application from "../models/application.model";
import Interview from "../models/interview.model";
import Company from "../models/company.model";
import { USER_ROLES } from "../constants/roles";
import { APPLICATION_STATUS } from "../constants/application-status";
import { INTERVIEW_STATUS, CANDIDATE_RSVP_STATUS } from "../constants/interview-status";
import * as interviewService from "../services/interview.service";

import { EMPLOYMENT_TYPE } from "../constants/employment-type";
import { EXPERIENCE_LEVEL } from "../constants/experience-level";
import { JOB_STATUS } from "../constants/job-status";

async function runInterviewServiceTests() {
  console.log("==================================================");
  console.log("🧪 RUNNING INTERVIEW SERVICE BUSINESS RULES TESTS");
  console.log("==================================================\n");

  await connectDB();

  // Setup Clean Test Fixtures
  const testSuffix = Date.now().toString().slice(-6);

  const recruiterUser = await User.create({
    name: `Test Recruiter ${testSuffix}`,
    email: `recruiter_${testSuffix}@example.com`,
    password: "Password123!",
    role: USER_ROLES.RECRUITER,
    isEmailVerified: true,
  });

  const otherRecruiterUser = await User.create({
    name: `Other Recruiter ${testSuffix}`,
    email: `other_recruiter_${testSuffix}@example.com`,
    password: "Password123!",
    role: USER_ROLES.RECRUITER,
    isEmailVerified: true,
  });

  const candidateUser = await User.create({
    name: `Test Candidate ${testSuffix}`,
    email: `candidate_${testSuffix}@example.com`,
    password: "Password123!",
    role: USER_ROLES.CANDIDATE,
    isEmailVerified: true,
  });

  const otherCandidateUser = await User.create({
    name: `Other Candidate ${testSuffix}`,
    email: `other_candidate_${testSuffix}@example.com`,
    password: "Password123!",
    role: USER_ROLES.CANDIDATE,
    isEmailVerified: true,
  });

  const company = await Company.create({
    name: `Enterprise Tech ${testSuffix}`,
    description: "Leading technology enterprise for software development",
    recruiterId: recruiterUser._id,
    isVerified: true,
  });

  const job = await Job.create({
    title: `Senior Fullstack Engineer ${testSuffix}`,
    description: "Developing next-gen cloud platforms",
    company: company.name,
    companyId: company._id,
    recruiterId: recruiterUser._id,
    location: "Bangalore / Remote",
    salaryMin: 120000,
    salaryMax: 180000,
    employmentType: EMPLOYMENT_TYPE.FULL_TIME,
    experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
    status: JOB_STATUS.ACTIVE,
  });

  const application = await Application.create({
    jobId: job._id,
    applicantId: candidateUser._id,
    applicantName: candidateUser.name,
    applicantEmail: candidateUser.email,
    resume: "https://example.com/resume.pdf",
    status: APPLICATION_STATUS.UNDER_REVIEW,
  });

  const rejectedApplication = await Application.create({
    jobId: job._id,
    applicantId: otherCandidateUser._id,
    applicantName: otherCandidateUser.name,
    applicantEmail: otherCandidateUser.email,
    resume: "https://example.com/resume2.pdf",
    status: APPLICATION_STATUS.REJECTED,
  });

  try {
    // 1. Valid Recruiter Creates Interview
    console.log("1. Testing valid recruiter creates interview...");
    const validStartTime = new Date(Date.now() + 86400000); // 24h ahead
    const createdInterview = await interviewService.createInterview(
      {
        applicationId: application._id.toString(),
        title: "Round 1: Screening",
        type: "HR Screening",
        scheduledStartTime: validStartTime.toISOString(),
        durationMinutes: 45,
        locationOrLink: "https://meet.google.com/test-room",
      },
      recruiterUser._id.toString(),
      USER_ROLES.RECRUITER
    );
    assert.strictEqual(createdInterview.status, INTERVIEW_STATUS.SCHEDULED);
    assert.strictEqual(createdInterview.roundNumber, 1);
    assert.strictEqual(createdInterview.recruiterId.toString(), recruiterUser._id.toString());
    assert.strictEqual(createdInterview.candidateId.toString(), candidateUser._id.toString());
    console.log("  ✅ Valid interview scheduled successfully.");

    // 2. Unauthorized Recruiter Cannot Create For Another Recruiter's Job
    console.log("2. Testing unauthorized recruiter rejected...");
    let unauthRecruiterError = false;
    try {
      await interviewService.createInterview(
        {
          applicationId: application._id.toString(),
          scheduledStartTime: new Date(Date.now() + 90000000).toISOString(),
        },
        otherRecruiterUser._id.toString(),
        USER_ROLES.RECRUITER
      );
    } catch (err: any) {
      unauthRecruiterError = true;
      assert.strictEqual(err.statusCode, 403);
    }
    assert(unauthRecruiterError, "Expected unauthorized recruiter to be rejected with 403");
    console.log("  ✅ Unauthorized recruiter denied.");

    // 3. Candidate Cannot Create an Interview As Recruiter
    console.log("3. Testing candidate cannot create interview...");
    let candidateCreateError = false;
    try {
      await interviewService.createInterview(
        {
          applicationId: application._id.toString(),
          scheduledStartTime: new Date(Date.now() + 95000000).toISOString(),
        },
        candidateUser._id.toString(),
        USER_ROLES.CANDIDATE
      );
    } catch (err: any) {
      candidateCreateError = true;
      assert.strictEqual(err.statusCode, 403);
    }
    assert(candidateCreateError, "Expected candidate create to be rejected with 403");
    console.log("  ✅ Candidate create attempt denied.");

    // 4. Candidate Can View Own Interview
    console.log("4. Testing candidate views own interview...");
    const candidateView = await interviewService.getInterviewById(
      createdInterview._id.toString(),
      candidateUser._id.toString(),
      USER_ROLES.CANDIDATE
    );
    assert.strictEqual(candidateView._id.toString(), createdInterview._id.toString());
    console.log("  ✅ Candidate successfully retrieved own interview.");

    // 5. Unrelated Candidate Cannot View Interview
    console.log("5. Testing unrelated candidate cannot view interview...");
    let unrelatedCandidateError = false;
    try {
      await interviewService.getInterviewById(
        createdInterview._id.toString(),
        otherCandidateUser._id.toString(),
        USER_ROLES.CANDIDATE
      );
    } catch (err: any) {
      unrelatedCandidateError = true;
      assert.strictEqual(err.statusCode, 403);
    }
    assert(unrelatedCandidateError, "Expected unrelated candidate to be rejected with 403");
    console.log("  ✅ Unrelated candidate access denied.");

    // 6. Valid Candidate Accepts
    console.log("6. Testing candidate accepts interview...");
    const acceptedInterview = await interviewService.candidateRsvp(
      createdInterview._id.toString(),
      { action: "accept", note: "Looking forward to it!" },
      candidateUser._id.toString()
    );
    assert.strictEqual(acceptedInterview.status, INTERVIEW_STATUS.ACCEPTED);
    assert.strictEqual(acceptedInterview.candidateResponse.status, CANDIDATE_RSVP_STATUS.ACCEPTED);
    console.log("  ✅ Candidate accept transition verified.");

    // 7. Candidate Cannot Accept Another Candidate's Interview
    console.log("7. Testing wrong candidate cannot accept interview...");
    let wrongCandidateAcceptError = false;
    try {
      await interviewService.candidateRsvp(
        createdInterview._id.toString(),
        { action: "accept" },
        otherCandidateUser._id.toString()
      );
    } catch (err: any) {
      wrongCandidateAcceptError = true;
      assert.strictEqual(err.statusCode, 403);
    }
    assert(wrongCandidateAcceptError, "Expected wrong candidate to be rejected with 403");
    console.log("  ✅ Wrong candidate RSVP denied.");

    // 8. Idempotent Accept
    console.log("8. Testing idempotent candidate accept...");
    const duplicateAccept = await interviewService.candidateRsvp(
      createdInterview._id.toString(),
      { action: "accept" },
      candidateUser._id.toString()
    );
    assert.strictEqual(duplicateAccept.status, INTERVIEW_STATUS.ACCEPTED);
    console.log("  ✅ Idempotent accept succeeded cleanly.");

    // 9. Reschedule by Recruiter
    console.log("9. Testing recruiter reschedule...");
    const newTime = new Date(Date.now() + 172800000); // 48h ahead
    const rescheduled = await interviewService.rescheduleInterview(
      createdInterview._id.toString(),
      { scheduledStartTime: newTime.toISOString(), durationMinutes: 60, reason: "Interviewer conflict" },
      recruiterUser._id.toString(),
      USER_ROLES.RECRUITER
    );
    assert.strictEqual(rescheduled.status, INTERVIEW_STATUS.RESCHEDULED);
    assert.strictEqual(rescheduled.durationMinutes, 60);
    assert.strictEqual(rescheduled.candidateResponse.status, CANDIDATE_RSVP_STATUS.PENDING);
    console.log("  ✅ Recruiter reschedule verified.");

    // 10. Candidate Declines
    console.log("10. Testing candidate declines after reschedule...");
    const declined = await interviewService.candidateRsvp(
      createdInterview._id.toString(),
      { action: "decline", note: "Not available at this time" },
      candidateUser._id.toString()
    );
    assert.strictEqual(declined.status, INTERVIEW_STATUS.DECLINED);
    assert.strictEqual(declined.candidateResponse.status, CANDIDATE_RSVP_STATUS.DECLINED);
    console.log("  ✅ Candidate decline verified.");

    // 11. Idempotent Decline
    console.log("11. Testing idempotent candidate decline...");
    const dupDecline = await interviewService.candidateRsvp(
      createdInterview._id.toString(),
      { action: "decline" },
      candidateUser._id.toString()
    );
    assert.strictEqual(dupDecline.status, INTERVIEW_STATUS.DECLINED);
    console.log("  ✅ Idempotent decline verified.");

    // 12. Candidate Requests Reschedule
    console.log("12. Testing candidate requests reschedule...");
    // First reschedule to scheduled
    const reInvite = await interviewService.rescheduleInterview(
      createdInterview._id.toString(),
      { scheduledStartTime: new Date(Date.now() + 200000000).toISOString() },
      recruiterUser._id.toString(),
      USER_ROLES.RECRUITER
    );
    const rescheduleReq = await interviewService.candidateRsvp(
      createdInterview._id.toString(),
      { action: "request_reschedule", suggestedTime: "Tomorrow at 3 PM" },
      candidateUser._id.toString()
    );
    assert.strictEqual(rescheduleReq.status, INTERVIEW_STATUS.RESCHEDULE_REQUESTED);
    assert.strictEqual(rescheduleReq.candidateResponse.suggestedTime, "Tomorrow at 3 PM");
    console.log("  ✅ Candidate reschedule request verified.");

    // 13. Complete Interview & Feedback
    console.log("13. Testing complete interview flow...");
    // Recruiter sets the rescheduled time based on request
    await interviewService.rescheduleInterview(
      createdInterview._id.toString(),
      { scheduledStartTime: new Date(Date.now() + 220000000).toISOString() },
      recruiterUser._id.toString(),
      USER_ROLES.RECRUITER
    );
    // Candidate accepts the rescheduled slot
    await interviewService.candidateRsvp(
      createdInterview._id.toString(),
      { action: "accept" },
      candidateUser._id.toString()
    );
    // Recruiter conducts & marks complete
    const completed = await interviewService.completeInterview(
      createdInterview._id.toString(),
      { rating: 5, notes: "Excellent coding proficiency" },
      recruiterUser._id.toString(),
      USER_ROLES.RECRUITER
    );
    assert.strictEqual(completed.status, INTERVIEW_STATUS.COMPLETED);
    assert.strictEqual(completed.feedback?.rating, 5);
    console.log("  ✅ Complete interview and feedback verified.");

    // 14. Invalid Status Transition (Cannot cancel or reschedule completed interview)
    console.log("14. Testing invalid transition from terminal state (Completed)...");
    let invalidTransitionError = false;
    try {
      await interviewService.rescheduleInterview(
        createdInterview._id.toString(),
        { scheduledStartTime: new Date(Date.now() + 300000000).toISOString() },
        recruiterUser._id.toString(),
        USER_ROLES.RECRUITER
      );
    } catch (err: any) {
      invalidTransitionError = true;
      assert.strictEqual(err.statusCode, 400);
    }
    assert(invalidTransitionError, "Expected reschedule on completed interview to fail");
    console.log("  ✅ Transition guard on completed interview enforced.");

    // 15. Create Round 2 Interview & Test Recruiter Cancel
    console.log("15. Testing Round 2 creation and recruiter cancel...");
    const round2StartTime = new Date(Date.now() + 250000000);
    const round2 = await interviewService.createInterview(
      {
        applicationId: application._id.toString(),
        title: "Round 2: System Design",
        type: "System Design Round",
        scheduledStartTime: round2StartTime.toISOString(),
      },
      recruiterUser._id.toString(),
      USER_ROLES.RECRUITER
    );
    assert.strictEqual(round2.roundNumber, 2);

    const cancelled = await interviewService.cancelInterview(
      round2._id.toString(),
      "Position closed internally",
      recruiterUser._id.toString(),
      USER_ROLES.RECRUITER
    );
    assert.strictEqual(cancelled.status, INTERVIEW_STATUS.CANCELLED);
    console.log("  ✅ Multi-round sequential creation & cancellation verified.");

    // 16. Duplicate Cancel Idempotency
    console.log("16. Testing duplicate cancel idempotency...");
    const dupCancel = await interviewService.cancelInterview(
      round2._id.toString(),
      "Again",
      recruiterUser._id.toString(),
      USER_ROLES.RECRUITER
    );
    assert.strictEqual(dupCancel.status, INTERVIEW_STATUS.CANCELLED);
    console.log("  ✅ Duplicate cancel handled idempotently.");

    // 17. Ineligible Application Rejection (Rejected Application)
    console.log("17. Testing ineligible application rejection...");
    let ineligibleAppError = false;
    try {
      await interviewService.createInterview(
        {
          applicationId: rejectedApplication._id.toString(),
          scheduledStartTime: new Date(Date.now() + 300000000).toISOString(),
        },
        recruiterUser._id.toString(),
        USER_ROLES.RECRUITER
      );
    } catch (err: any) {
      ineligibleAppError = true;
      assert.strictEqual(err.statusCode, 400);
    }
    assert(ineligibleAppError, "Expected scheduling on rejected application to fail");
    console.log("  ✅ Ineligible application correctly rejected.");

    // 18. Past Scheduled Time Rejection
    console.log("18. Testing past schedule rejection...");
    let pastScheduleError = false;
    try {
      await interviewService.createInterview(
        {
          applicationId: application._id.toString(),
          scheduledStartTime: new Date(Date.now() - 3600000 * 24).toISOString(),
        },
        recruiterUser._id.toString(),
        USER_ROLES.RECRUITER
      );
    } catch (err: any) {
      pastScheduleError = true;
      assert.strictEqual(err.statusCode, 400);
    }
    assert(pastScheduleError, "Expected past schedule to fail with 400");
    console.log("  ✅ Past scheduling rejected.");

    // 19. Overlapping Schedule Conflict Rejection
    console.log("19. Testing scheduling overlap conflict detection...");
    // Create an active interview slot
    const slotStartTime = new Date(Date.now() + 400000000);
    const slotInterview = await interviewService.createInterview(
      {
        applicationId: application._id.toString(),
        scheduledStartTime: slotStartTime.toISOString(),
        durationMinutes: 60,
      },
      recruiterUser._id.toString(),
      USER_ROLES.RECRUITER
    );

    // Attempt to schedule another interview overlapping by 30 mins
    let overlapConflictError = false;
    try {
      await interviewService.createInterview(
        {
          applicationId: application._id.toString(),
          scheduledStartTime: new Date(slotStartTime.getTime() + 30 * 60000).toISOString(),
          durationMinutes: 45,
        },
        recruiterUser._id.toString(),
        USER_ROLES.RECRUITER
      );
    } catch (err: any) {
      overlapConflictError = true;
      assert.strictEqual(err.statusCode, 409);
    }
    assert(overlapConflictError, "Expected overlapping interview to be rejected with 409 Conflict");
    console.log("  ✅ Overlapping schedule conflict detected and rejected with 409.");

    // 20. List Interviews with Pagination & Filters
    console.log("20. Testing listInterviews pagination & scoping...");
    const recruiterList = await interviewService.listInterviews(
      { page: 1, limit: 10 },
      recruiterUser._id.toString(),
      USER_ROLES.RECRUITER
    );
    assert(recruiterList.items.length >= 2, "Recruiter should list their interviews");
    assert.strictEqual(recruiterList.pagination.page, 1);

    const candidateList = await interviewService.listInterviews(
      { page: 1, limit: 10 },
      candidateUser._id.toString(),
      USER_ROLES.CANDIDATE
    );
    assert(candidateList.items.length >= 2, "Candidate should list their interviews");
    console.log("  ✅ Paginated listInterviews verified for recruiter and candidate.");

    // 21. Application Interview History
    console.log("21. Testing getInterviewsForApplication...");
    const appHistory = await interviewService.getInterviewsForApplication(
      application._id.toString(),
      recruiterUser._id.toString(),
      USER_ROLES.RECRUITER
    );
    assert(appHistory.length >= 2, "Application history should return all rounds");
    assert.strictEqual(appHistory[0].roundNumber, 1);
    console.log("  ✅ Multi-round application interview history verified.");

    // 22. Date-Range Filtering
    console.log("22. Testing date-range filtering in listInterviews...");
    const dateRangeList = await interviewService.listInterviews(
      {
        from: new Date(Date.now() + 390000000).toISOString(),
        to: new Date(Date.now() + 410000000).toISOString(),
      },
      recruiterUser._id.toString(),
      USER_ROLES.RECRUITER
    );
    assert.strictEqual(dateRangeList.items.length, 1);
    assert.strictEqual(dateRangeList.items[0]._id.toString(), slotInterview._id.toString());
    console.log("  ✅ Date-range filtering verified.");

    console.log("\n==================================================");
    console.log("🎉 ALL 22 INTERVIEW SERVICE BUSINESS TESTS PASSED!");
    console.log("==================================================");
  } finally {
    // Clean up test documents
    await Interview.deleteMany({ applicationId: { $in: [application._id, rejectedApplication._id] } });
    await Application.deleteMany({ _id: { $in: [application._id, rejectedApplication._id] } });
    await Job.deleteOne({ _id: job._id });
    await Company.deleteOne({ _id: company._id });
    await User.deleteMany({ _id: { $in: [recruiterUser._id, otherRecruiterUser._id, candidateUser._id, otherCandidateUser._id] } });
  }
}

runInterviewServiceTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Interview Service Test failed:", err);
    process.exit(1);
  });
