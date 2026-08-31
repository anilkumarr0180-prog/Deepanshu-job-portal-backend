import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/user.model";
import Job from "../models/job.model";
import RecruiterProfile from "../models/recruiter-profile.model";
import CandidateProfile from "../models/candidate-profile.model";
import Application from "../models/application.model";
import Notification from "../models/notification.model";
import { APPLICATION_STATUS } from "../constants/application-status";
import { JOB_STATUS } from "../constants/job-status";
import { EMPLOYMENT_TYPE } from "../constants/employment-type";
import { EXPERIENCE_LEVEL } from "../constants/experience-level";
import {
  quickApply,
  applyForJob,
  getMyApplications,
  withdrawApplication,
  updateApplicationStatus,
} from "../services/application.service";
import { AppError } from "../utils/app-error";

async function runQuickApplyTests() {
  console.log("=============================================================");
  console.log("   JOBBOX QUICK APPLY - PRODUCTION INTEGRATION TEST SUITE    ");
  console.log("=============================================================");

  const mongoUri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal";
  await mongoose.connect(mongoUri);
  console.log("✔ Connected to MongoDB");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✔ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`✖ FAIL: ${testName} ${detail ? "- " + detail : ""}`);
      failed++;
    }
  }

  const cleanupUserIds: Types.ObjectId[] = [];
  const cleanupJobIds: Types.ObjectId[] = [];
  const cleanupProfileIds: Types.ObjectId[] = [];
  const cleanupAppIds: Types.ObjectId[] = [];

  try {
    const timestamp = Date.now();

    // 1. Setup Recruiter User & Profile
    const recruiterUser: any = await User.create({
      name: `Recruiter QuickApply ${timestamp}`,
      email: `recruiter_qa_${timestamp}@example.com`,
      password: "Password123!",
      role: "recruiter",
      isEmailVerified: true,
    });
    cleanupUserIds.push(recruiterUser._id as Types.ObjectId);

    const recruiterProfile: any = await RecruiterProfile.create({
      userId: recruiterUser._id,
      designation: "Head of Talent",
    });
    cleanupProfileIds.push(recruiterProfile._id as Types.ObjectId);

    // 2. Setup Active Job
    const activeJob: any = await Job.create({
      title: "Senior Full Stack Engineer",
      description: "Exciting opportunity to build cutting edge platforms.",
      company: "Acme Quick Tech",
      location: "San Francisco, CA",
      salaryMin: 140000,
      salaryMax: 190000,
      currency: "USD",
      salaryPeriod: "yearly",
      workMode: "remote",
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
      status: JOB_STATUS.ACTIVE,
      skills: ["TypeScript", "Node.js", "React", "MongoDB"],
      postedBy: recruiterProfile._id,
      recruiterId: recruiterUser._id,
      publishedAt: new Date(),
    });
    cleanupJobIds.push(activeJob._id as Types.ObjectId);

    // 3. Setup Closed Job
    const closedJob: any = await Job.create({
      title: "Closed Frontend Role",
      description: "This role is closed.",
      company: "Acme Quick Tech",
      location: "Remote",
      salaryMin: 90000,
      salaryMax: 110000,
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.THREE_TO_FIVE_YEARS,
      status: JOB_STATUS.CLOSED,
      postedBy: recruiterProfile._id,
      recruiterId: recruiterUser._id,
    });
    cleanupJobIds.push(closedJob._id as Types.ObjectId);

    // 4. Setup Expired Job
    const expiredJob: any = await Job.create({
      title: "Expired Backend Role",
      description: "This role is expired.",
      company: "Acme Quick Tech",
      location: "Remote",
      salaryMin: 100000,
      salaryMax: 120000,
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.THREE_TO_FIVE_YEARS,
      status: JOB_STATUS.ACTIVE,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      postedBy: recruiterProfile._id,
      recruiterId: recruiterUser._id,
    });
    cleanupJobIds.push(expiredJob._id as Types.ObjectId);

    // 5. Setup Candidate User with Profile & Resume
    const candidateUser = await User.create({
      name: "John Quick Candidate",
      email: `candidate_qa_${timestamp}@example.com`,
      password: "Password123!",
      role: "candidate",
      isEmailVerified: true,
      phone: "+1 555-0199",
    });
    cleanupUserIds.push(candidateUser._id as Types.ObjectId);

    const candidateProfile = await CandidateProfile.create({
      userId: candidateUser._id,
      headline: "Senior Cloud Architect",
      phone: "+1 555-0199",
      skills: ["TypeScript", "AWS", "Node.js", "Docker"],
      experience: [
        {
          title: "Cloud Engineer",
          company: "CloudTech Inc",
          startDate: new Date("2021-01-01"),
          current: true,
        },
      ],
      resumeUrl: "https://res.cloudinary.com/demo/image/upload/v1/resume.pdf",
      resumeFileName: "John_Candidate_Resume.pdf",
      resumePublicId: "resumes/john_qa_123",
    });
    cleanupProfileIds.push(candidateProfile._id as Types.ObjectId);

    // 6. Setup Candidate User WITHOUT Resume
    const candidateNoResume = await User.create({
      name: "No Resume Candidate",
      email: `no_resume_${timestamp}@example.com`,
      password: "Password123!",
      role: "candidate",
      isEmailVerified: true,
    });
    cleanupUserIds.push(candidateNoResume._id as Types.ObjectId);

    const profileNoResume = await CandidateProfile.create({
      userId: candidateNoResume._id,
      headline: "Junior Dev",
    });
    cleanupProfileIds.push(profileNoResume._id as Types.ObjectId);

    // 7. Setup Blocked Candidate
    const blockedCandidate = await User.create({
      name: "Blocked Candidate",
      email: `blocked_cand_${timestamp}@example.com`,
      password: "Password123!",
      role: "candidate",
      isBlocked: true,
      isEmailVerified: true,
    });
    cleanupUserIds.push(blockedCandidate._id as Types.ObjectId);

    console.log("\n--- TEST CASE 1: Happy Path Quick Apply ---");
    const app1 = await quickApply(candidateUser._id.toString(), {
      jobId: activeJob._id.toString(),
      coverLetter: "Excited about this role!",
    });
    cleanupAppIds.push(app1._id as Types.ObjectId);

    assert(Boolean(app1 && app1._id), "Quick apply creates application document");
    assert(app1.status === APPLICATION_STATUS.APPLIED, "Initial status is 'Applied'");
    assert(
      app1.applicantName === candidateUser.name,
      "Applicant name snapshot matches candidate"
    );
    assert(
      app1.applicantEmail === candidateUser.email,
      "Applicant email snapshot matches candidate"
    );
    assert(
      app1.applicantPhone === "+1 555-0199",
      "Applicant phone snapshot matches candidate profile"
    );
    assert(
      app1.applicantDesignation === "Senior Cloud Architect",
      "Applicant designation snapshot matches candidate profile headline"
    );
    assert(
      app1.resume === candidateProfile.resumeUrl,
      "Resume URL snapshot matches candidate profile resume"
    );
    assert(
      app1.resumeFileName === candidateProfile.resumeFileName,
      "Resume file name matches profile"
    );
    assert(
      app1.coverLetter === "Excited about this role!",
      "Cover letter is properly captured"
    );

    console.log("\n--- TEST CASE 2: Duplicate Application Prevention (Sequential) ---");
    let duplicateError: any = null;
    try {
      await quickApply(candidateUser._id.toString(), {
        jobId: activeJob._id.toString(),
      });
    } catch (err: any) {
      duplicateError = err;
    }
    assert(
      duplicateError instanceof AppError && duplicateError.statusCode === 409,
      "Duplicate Quick Apply returns HTTP 409 Conflict",
      duplicateError?.message
    );

    console.log("\n--- TEST CASE 3: Concurrency Protection (Parallel Quick Apply) ---");
    const concurrentCandidate = await User.create({
      name: "Concurrent Candidate",
      email: `concurrent_${timestamp}@example.com`,
      password: "Password123!",
      role: "candidate",
      isEmailVerified: true,
    });
    cleanupUserIds.push(concurrentCandidate._id as Types.ObjectId);

    await CandidateProfile.create({
      userId: concurrentCandidate._id,
      resumeUrl: "https://example.com/concurrent-resume.pdf",
      resumeFileName: "Concurrent_Resume.pdf",
    });

    const parallelResults = await Promise.allSettled([
      quickApply(concurrentCandidate._id.toString(), {
        jobId: activeJob._id.toString(),
      }),
      quickApply(concurrentCandidate._id.toString(), {
        jobId: activeJob._id.toString(),
      }),
    ]);

    const fulfilledCount = parallelResults.filter(
      (r) => r.status === "fulfilled"
    ).length;
    const rejectedCount = parallelResults.filter(
      (r) => r.status === "rejected"
    ).length;

    assert(
      fulfilledCount === 1 && rejectedCount === 1,
      "Concurrent Quick Apply allows exactly 1 successful application and rejects duplicate"
    );

    const activeAppsForConcurrent = await Application.find({
      jobId: activeJob._id,
      applicantId: concurrentCandidate._id,
      isDeleted: false,
    });
    assert(
      activeAppsForConcurrent.length === 1,
      "Database contains exactly 1 active application record under race condition"
    );
    cleanupAppIds.push(activeAppsForConcurrent[0]._id as Types.ObjectId);

    console.log("\n--- TEST CASE 4: Missing Resume Validation ---");
    let noResumeError: any = null;
    try {
      await quickApply(candidateNoResume._id.toString(), {
        jobId: activeJob._id.toString(),
      });
    } catch (err: any) {
      noResumeError = err;
    }
    assert(
      noResumeError instanceof AppError && noResumeError.statusCode === 400,
      "Quick Apply without resume returns HTTP 400 Bad Request",
      noResumeError?.message
    );

    console.log("\n--- TEST CASE 5: Closed & Expired Job Validation ---");
    let closedJobError: any = null;
    try {
      await quickApply(candidateUser._id.toString(), {
        jobId: closedJob._id.toString(),
      });
    } catch (err: any) {
      closedJobError = err;
    }
    assert(
      closedJobError instanceof AppError && closedJobError.statusCode === 400,
      "Quick Apply on closed job returns HTTP 400",
      closedJobError?.message
    );

    let expiredJobError: any = null;
    try {
      await quickApply(candidateUser._id.toString(), {
        jobId: expiredJob._id.toString(),
      });
    } catch (err: any) {
      expiredJobError = err;
    }
    assert(
      expiredJobError instanceof AppError && expiredJobError.statusCode === 400,
      "Quick Apply on expired job returns HTTP 400",
      expiredJobError?.message
    );

    console.log("\n--- TEST CASE 6: Blocked Candidate & Self Application Checks ---");
    let blockedError: any = null;
    try {
      await quickApply(blockedCandidate._id.toString(), {
        jobId: activeJob._id.toString(),
      });
    } catch (err: any) {
      blockedError = err;
    }
    assert(
      blockedError instanceof AppError && blockedError.statusCode === 403,
      "Blocked candidate Quick Apply returns HTTP 403 Forbidden",
      blockedError?.message
    );

    let selfApplyError: any = null;
    try {
      await quickApply(recruiterUser._id.toString(), {
        jobId: activeJob._id.toString(),
      });
    } catch (err: any) {
      selfApplyError = err;
    }
    assert(
      selfApplyError instanceof AppError && selfApplyError.statusCode === 403,
      "Self application by recruiter returns HTTP 403 Forbidden",
      selfApplyError?.message
    );

    console.log("\n--- TEST CASE 7: Application Withdrawal & Revival via Quick Apply ---");
    await withdrawApplication(app1._id.toString(), candidateUser._id.toString());
    const withdrawnApp = await Application.findById(app1._id);
    assert(withdrawnApp?.isDeleted === true, "Application is soft deleted upon withdrawal");

    const revivedApp = await quickApply(candidateUser._id.toString(), {
      jobId: activeJob._id.toString(),
      coverLetter: "Re-applying with updated interest!",
    });
    assert(
      revivedApp._id.toString() === app1._id.toString(),
      "Quick apply revives the existing application document"
    );
    assert(revivedApp.isDeleted === false, "Revived application is marked isDeleted: false");
    assert(
      revivedApp.coverLetter === "Re-applying with updated interest!",
      "Revived application updates snapshot with new details"
    );

    console.log("\n--- TEST CASE 8: Real-Time Notifications Created ---");
    const candidateNotif = await Notification.findOne({
      recipientId: candidateUser._id,
      "metadata.jobId": activeJob._id.toString(),
    });
    assert(Boolean(candidateNotif), "Candidate received real-time application notification");

    const recruiterNotif = await Notification.findOne({
      recipientId: recruiterUser._id,
      "metadata.jobId": activeJob._id.toString(),
    });
    assert(Boolean(recruiterNotif), "Recruiter received real-time application notification");

    console.log("\n--- TEST CASE 9: Regression Test - Normal Apply & ATS Lifecycle ---");
    const normalCandidate = await User.create({
      name: "Normal Apply Candidate",
      email: `normal_cand_${timestamp}@example.com`,
      password: "Password123!",
      role: "candidate",
      isEmailVerified: true,
      resumeUrl: "https://example.com/normal-resume.pdf",
    });
    cleanupUserIds.push(normalCandidate._id as Types.ObjectId);

    const normalApp = await applyForJob(activeJob._id.toString(), normalCandidate._id.toString(), {
      applicantName: "Custom Name",
      applicantDesignation: "Custom Title",
      experienceYears: 5,
      relevantSkills: ["Node.js", "Express"],
      noticePeriod: "2 Weeks",
      coverLetter: "Normal application flow.",
      resumeUrl: "https://example.com/custom-resume.pdf",
      resumeFileName: "Custom_Resume.pdf",
    });
    cleanupAppIds.push(normalApp._id as Types.ObjectId);

    assert(Boolean(normalApp && normalApp._id), "Normal applyForJob works as expected");
    assert(normalApp.applicantName === "Custom Name", "Normal apply preserves custom snapshot fields");

    const updatedStatus = await updateApplicationStatus(
      normalApp._id.toString(),
      recruiterUser._id.toString(),
      APPLICATION_STATUS.UNDER_REVIEW
    );
    assert(
      updatedStatus.status === APPLICATION_STATUS.UNDER_REVIEW,
      "Application status update in ATS functions normally"
    );

    console.log("\n=============================================================");
    console.log(` TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("=============================================================");
  } finally {
    console.log("\n🧹 Cleaning up test artifacts...");
    await Application.deleteMany({ _id: { $in: cleanupAppIds } });
    await Notification.deleteMany({
      recipientId: { $in: cleanupUserIds },
    });
    await Job.deleteMany({ _id: { $in: cleanupJobIds } });
    await CandidateProfile.deleteMany({ _id: { $in: cleanupProfileIds } });
    await RecruiterProfile.deleteMany({ _id: { $in: cleanupProfileIds } });
    await User.deleteMany({ _id: { $in: cleanupUserIds } });
    await mongoose.disconnect();
    console.log("✔ Disconnected from MongoDB. Clean up complete.");
  }
}

runQuickApplyTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
