import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/user.model";
import Job from "../models/job.model";
import RecruiterProfile from "../models/recruiter-profile.model";
import CandidateProfile from "../models/candidate-profile.model";
import Application from "../models/application.model";
import ApplicationStatusHistory from "../models/application-status-history.model";
import { APPLICATION_STATUS } from "../constants/application-status";
import { JOB_STATUS } from "../constants/job-status";
import { EMPLOYMENT_TYPE } from "../constants/employment-type";
import { EXPERIENCE_LEVEL } from "../constants/experience-level";
import {
  applyForJob,
  getMyApplications,
  getJobApplications,
  getRecruiterApplications,
  updateApplicationStatus,
  getApplicationHistory,
  withdrawApplication,
} from "../services/application.service";
import { AppError } from "../utils/app-error";

async function runATSPhase1Tests() {
  console.log("=============================================================");
  console.log("   JOBBOX ATS - PHASE 1 VERIFICATION & AUDIT SUITE           ");
  console.log("=============================================================");

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
      console.error(` FAIL: ${testName} ${detail ? "- " + detail : ""}`);
      failed++;
    }
  }

  const createdUserIds: any[] = [];
  const createdJobIds: any[] = [];
  const createdAppIds: any[] = [];

  try {
    const timestamp = Date.now();

    // Setup Candidate
    const candidate = await User.create({
      name: "ATS Test Candidate",
      email: `candidate_ats_${timestamp}@example.com`,
      password: "Password123!",
      role: "candidate",
      isEmailVerified: true,
      resumeUrl: "https://example.com/candidate-resume.pdf",
    });
    createdUserIds.push(candidate._id);

    await CandidateProfile.create({
      userId: candidate._id,
      resumeUrl: "https://example.com/candidate-resume.pdf",
      resumeFileName: "CandidateResume.pdf",
    });

    // Setup Recruiter A
    const recruiterA = await User.create({
      name: "ATS Recruiter A",
      email: `recruiter_a_${timestamp}@example.com`,
      password: "Password123!",
      role: "recruiter",
      isEmailVerified: true,
    });
    createdUserIds.push(recruiterA._id);

    const recruiterAProfile = await RecruiterProfile.create({
      userId: recruiterA._id,
    });

    // Setup Recruiter B
    const recruiterB = await User.create({
      name: "ATS Recruiter B",
      email: `recruiter_b_${timestamp}@example.com`,
      password: "Password123!",
      role: "recruiter",
      isEmailVerified: true,
    });
    createdUserIds.push(recruiterB._id);

    const recruiterBProfile = await RecruiterProfile.create({
      userId: recruiterB._id,
    });

    // Setup Job A for Recruiter A
    const jobA = await Job.create({
      title: "Senior Full-Stack Engineer",
      description: "Join our core platform team building ATS solutions.",
      company: "TechCorp Global",
      location: "San Francisco, CA",
      salaryMin: 140000,
      salaryMax: 180000,
      currency: "USD",
      salaryPeriod: "yearly",
      workMode: "remote",
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
      status: JOB_STATUS.ACTIVE,
      skills: ["React", "Node.js", "TypeScript", "MongoDB"],
      recruiterId: recruiterA._id,
      postedBy: recruiterAProfile._id,
      isDeleted: false,
    });
    createdJobIds.push(jobA._id);

    // Setup Job B for Recruiter B
    const jobB = await Job.create({
      title: "DevOps Engineer",
      description: "Manage high-scale cloud infrastructure.",
      company: "CloudScale Inc",
      location: "New York, NY",
      salaryMin: 130000,
      salaryMax: 170000,
      currency: "USD",
      salaryPeriod: "yearly",
      workMode: "remote",
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.THREE_TO_FIVE_YEARS,
      status: JOB_STATUS.ACTIVE,
      skills: ["AWS", "Docker", "Kubernetes"],
      recruiterId: recruiterB._id,
      postedBy: recruiterBProfile._id,
      isDeleted: false,
    });
    createdJobIds.push(jobB._id);

    console.log("\n--- 1. APPLICATION SUBMISSION (REGRESSION CHECK) ---");
    const appA = await applyForJob(jobA._id.toString(), candidate._id.toString(), {
      coverLetter: "Excited to apply for the Senior Full-Stack role.",
      applicantName: candidate.name,
      experienceYears: 6,
      relevantSkills: ["React", "Node.js", "TypeScript"],
    });
    createdAppIds.push(appA._id);

    assert(appA !== null && appA.status === APPLICATION_STATUS.APPLIED, "Candidate successfully applies to Job A with initial status 'Applied'");

    console.log("\n--- 2. CORRECTED DEFAULT BUSINESS RULE TRANSITIONS ---");

    // Test: APPLIED -> SHORTLISTED directly MUST FAIL
    let directShortlistFailed = false;
    try {
      await updateApplicationStatus(appA._id.toString(), recruiterA._id.toString(), APPLICATION_STATUS.SHORTLISTED);
    } catch (err: any) {
      directShortlistFailed = true;
      assert(err instanceof AppError && err.statusCode === 400, "Direct APPLIED -> SHORTLISTED transition is rejected with 400 Bad Request", err.message);
    }
    assert(directShortlistFailed, "APPLIED -> SHORTLISTED was correctly blocked by the state machine");

    // Test: APPLIED -> INTERVIEW directly MUST FAIL
    let directInterviewFailed = false;
    try {
      await updateApplicationStatus(appA._id.toString(), recruiterA._id.toString(), APPLICATION_STATUS.INTERVIEW, {
        interviewDetails: { date: "2026-09-01", time: "10:00 AM", mode: "video" },
      });
    } catch (err: any) {
      directInterviewFailed = true;
      assert(err instanceof AppError && err.statusCode === 400, "Direct APPLIED -> INTERVIEW transition is rejected with 400 Bad Request", err.message);
    }
    assert(directInterviewFailed, "APPLIED -> INTERVIEW was correctly blocked by the state machine");

    // Test: APPLIED -> HIRED directly MUST FAIL
    let directHiredFailed = false;
    try {
      await updateApplicationStatus(appA._id.toString(), recruiterA._id.toString(), APPLICATION_STATUS.HIRED);
    } catch (err: any) {
      directHiredFailed = true;
      assert(err instanceof AppError && err.statusCode === 400, "Direct APPLIED -> HIRED transition is rejected with 400 Bad Request", err.message);
    }
    assert(directHiredFailed, "APPLIED -> HIRED was correctly blocked by the state machine");

    // Test: Valid APPLIED -> UNDER_REVIEW
    const appUnderReview = await updateApplicationStatus(
      appA._id.toString(),
      recruiterA._id.toString(),
      APPLICATION_STATUS.UNDER_REVIEW,
      { reason: "Reviewing resume and portfolio" }
    );
    assert(appUnderReview.status === APPLICATION_STATUS.UNDER_REVIEW, "Valid APPLIED -> UNDER_REVIEW succeeds");

    // Test: UNDER_REVIEW -> HIRED directly MUST FAIL
    let underReviewToHiredFailed = false;
    try {
      await updateApplicationStatus(appA._id.toString(), recruiterA._id.toString(), APPLICATION_STATUS.HIRED);
    } catch (err: any) {
      underReviewToHiredFailed = true;
      assert(err instanceof AppError && err.statusCode === 400, "UNDER_REVIEW -> HIRED directly is rejected with 400 Bad Request", err.message);
    }
    assert(underReviewToHiredFailed, "UNDER_REVIEW -> HIRED was correctly blocked by the state machine");

    // Test: Valid UNDER_REVIEW -> SHORTLISTED
    const appShortlisted = await updateApplicationStatus(
      appA._id.toString(),
      recruiterA._id.toString(),
      APPLICATION_STATUS.SHORTLISTED,
      { reason: "Strong candidate match" }
    );
    assert(appShortlisted.status === APPLICATION_STATUS.SHORTLISTED, "Valid UNDER_REVIEW -> SHORTLISTED succeeds");

    // Test: SHORTLISTED -> HIRED directly MUST FAIL
    let shortlistedToHiredFailed = false;
    try {
      await updateApplicationStatus(appA._id.toString(), recruiterA._id.toString(), APPLICATION_STATUS.HIRED);
    } catch (err: any) {
      shortlistedToHiredFailed = true;
      assert(err instanceof AppError && err.statusCode === 400, "SHORTLISTED -> HIRED directly is rejected with 400 Bad Request", err.message);
    }
    assert(shortlistedToHiredFailed, "SHORTLISTED -> HIRED was correctly blocked by the state machine");

    // Test: Valid SHORTLISTED -> INTERVIEW (requires date/time)
    let interviewMissingDetailsFailed = false;
    try {
      await updateApplicationStatus(appA._id.toString(), recruiterA._id.toString(), APPLICATION_STATUS.INTERVIEW);
    } catch (err: any) {
      interviewMissingDetailsFailed = true;
      assert(err instanceof AppError && err.statusCode === 400, "INTERVIEW transition requires interview details", err.message);
    }
    assert(interviewMissingDetailsFailed, "INTERVIEW transition validated date and time requirement");

    const appInterview = await updateApplicationStatus(
      appA._id.toString(),
      recruiterA._id.toString(),
      APPLICATION_STATUS.INTERVIEW,
      {
        reason: "Scheduling technical round",
        interviewDetails: {
          mode: "video",
          date: "2026-09-02",
          time: "02:00 PM",
          locationOrLink: "https://meet.google.com/xyz-abc",
        },
      }
    );
    assert(appInterview.status === APPLICATION_STATUS.INTERVIEW, "Valid SHORTLISTED -> INTERVIEW with interviewDetails succeeds");

    // Test: Valid INTERVIEW -> HIRED
    const appHired = await updateApplicationStatus(
      appA._id.toString(),
      recruiterA._id.toString(),
      APPLICATION_STATUS.HIRED,
      { reason: "Candidate accepted offer" }
    );
    assert(appHired.status === APPLICATION_STATUS.HIRED, "Valid INTERVIEW -> HIRED succeeds");

    // Test: Terminal Status (HIRED cannot transition anywhere)
    let hiredToReviewFailed = false;
    try {
      await updateApplicationStatus(appA._id.toString(), recruiterA._id.toString(), APPLICATION_STATUS.UNDER_REVIEW);
    } catch (err: any) {
      hiredToReviewFailed = true;
      assert(err instanceof AppError && err.statusCode === 409, "HIRED terminal status rejects further transitions with 409 Conflict", err.message);
    }
    assert(hiredToReviewFailed, "Terminal HIRED status prevented illegal transition");

    console.log("\n--- 3. VALID REJECTIONS FROM ALL ACTIVE STAGES ---");
    // Create separate applications to test rejections from each active stage
    const candidate2 = await User.create({
      name: "Candidate 2",
      email: `candidate2_${timestamp}@example.com`,
      password: "Password123!",
      role: "candidate",
      resumeUrl: "https://example.com/resume.pdf",
    });
    createdUserIds.push(candidate2._id);
    await CandidateProfile.create({ userId: candidate2._id, resumeUrl: "https://example.com/resume.pdf" });

    // 1. APPLIED -> REJECTED
    const appRej1 = await applyForJob(jobA._id.toString(), candidate2._id.toString(), { resumeUrl: "https://example.com/resume.pdf" });
    createdAppIds.push(appRej1._id);
    const rejFromApplied = await updateApplicationStatus(appRej1._id.toString(), recruiterA._id.toString(), APPLICATION_STATUS.REJECTED, { reason: "Skills mismatch" });
    assert(rejFromApplied.status === APPLICATION_STATUS.REJECTED, "Valid APPLIED -> REJECTED succeeds");

    // 2. REJECTED is terminal
    let rejectedToInterviewFailed = false;
    try {
      await updateApplicationStatus(appRej1._id.toString(), recruiterA._id.toString(), APPLICATION_STATUS.INTERVIEW, {
        interviewDetails: { date: "2026-09-05", time: "11:00 AM" },
      });
    } catch (err: any) {
      rejectedToInterviewFailed = true;
      assert(err instanceof AppError && err.statusCode === 409, "REJECTED terminal status rejects transitions with 409 Conflict");
    }
    assert(rejectedToInterviewFailed, "Terminal REJECTED status correctly enforced");

    console.log("\n--- 4. AUTHORIZATION ISOLATION TESTS ---");
    // Recruiter B attempts to modify Recruiter A's application
    let unauthorizedRecruiterFailed = false;
    try {
      await updateApplicationStatus(appA._id.toString(), recruiterB._id.toString(), APPLICATION_STATUS.REJECTED);
    } catch (err: any) {
      unauthorizedRecruiterFailed = true;
      assert(err instanceof AppError && err.statusCode === 403, "Recruiter B cannot update Recruiter A's application (403 Forbidden)", err.message);
    }
    assert(unauthorizedRecruiterFailed, "Recruiter cross-tenant isolation enforced");

    console.log("\n--- 5. STATUS HISTORY MODEL AUDIT ---");
    const historyList = await getApplicationHistory(appA._id.toString(), recruiterA._id.toString(), "recruiter");
    assert(Array.isArray(historyList) && historyList.length === 4, `Application A has exactly 4 history records for 4 successful transitions (Found ${historyList.length})`);

    if (historyList.length === 4) {
      // History is sorted newest first
      assert(historyList[0].fromStatus === APPLICATION_STATUS.INTERVIEW && historyList[0].toStatus === APPLICATION_STATUS.HIRED, "History record 1: INTERVIEW -> HIRED");
      assert(historyList[1].fromStatus === APPLICATION_STATUS.SHORTLISTED && historyList[1].toStatus === APPLICATION_STATUS.INTERVIEW, "History record 2: SHORTLISTED -> INTERVIEW");
      assert(historyList[2].fromStatus === APPLICATION_STATUS.UNDER_REVIEW && historyList[2].toStatus === APPLICATION_STATUS.SHORTLISTED, "History record 3: UNDER_REVIEW -> SHORTLISTED");
      assert(historyList[3].fromStatus === APPLICATION_STATUS.APPLIED && historyList[3].toStatus === APPLICATION_STATUS.UNDER_REVIEW, "History record 4: APPLIED -> UNDER_REVIEW");
      assert(historyList[0].changedBy._id.toString() === recruiterA._id.toString(), "History records track the correct recruiter actor ID");
    }

    console.log("\n--- 6. REGRESSION VERIFICATION ---");
    const recruiterApps = await getRecruiterApplications(recruiterA._id.toString());
    assert(Array.isArray(recruiterApps) && recruiterApps.length >= 1, "Recruiter applications listing functions properly");

    const candidateApps = await getMyApplications(candidate._id.toString());
    assert(Array.isArray(candidateApps) && candidateApps.length >= 1, "Candidate applications listing functions properly");

    console.log("\n=============================================================");
    console.log(`   ATS PHASE 1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED     `);
    console.log("=============================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("FATAL ERROR IN ATS TEST SUITE:", error);
    process.exit(1);
  } finally {
    // Cleanup created test records
    await ApplicationStatusHistory.deleteMany({ applicationId: { $in: createdAppIds } });
    await Application.deleteMany({ _id: { $in: createdAppIds } });
    await Job.deleteMany({ _id: { $in: createdJobIds } });
    await CandidateProfile.deleteMany({ userId: { $in: createdUserIds } });
    await RecruiterProfile.deleteMany({ userId: { $in: createdUserIds } });
    await User.deleteMany({ _id: { $in: createdUserIds } });
    await mongoose.disconnect();
    console.log(" Disconnected from MongoDB & cleaned up test records");
  }
}

runATSPhase1Tests();
