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
  withdrawApplication,
} from "../services/application.service";
import { getCandidateDashboard } from "../services/dashboard.service";

async function runApplicationTests() {
  console.log("=============================================================");
  console.log("   APPLICATION LIFECYCLE & SECURITY VERIFICATION SUITE       ");
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
  const createdCompanyIds: any[] = [];

  try {
    const timestamp = Date.now();

    // 1. Setup Candidate
    const candidate = await User.create({
      name: "Test Candidate",
      email: `candidate_${timestamp}@example.com`,
      password: "Password123!",
      role: "candidate",
      isEmailVerified: true,
    });
    createdUserIds.push(candidate._id);

    await CandidateProfile.create({
      userId: candidate._id,
      headline: "Senior Software Engineer",
      resumeUrl: "https://res.cloudinary.com/demo/image/upload/v1/sample.pdf",
      resumeFileName: "CandidateResume.pdf",
      skills: ["Node.js", "TypeScript", "MongoDB"],
      phone: "+1234567890",
    });

    // 2. Setup Recruiter Owner & Company
    const recruiterOwner = await User.create({
      name: "Recruiter Owner",
      email: `recruiter_owner_${timestamp}@example.com`,
      password: "Password123!",
      role: "recruiter",
      isEmailVerified: true,
    });
    createdUserIds.push(recruiterOwner._id);

    const ownerProfile = await RecruiterProfile.create({
      userId: recruiterOwner._id,
    });

    const company = await Company.create({
      name: `Acme Corp ${timestamp}`,
      description: "Leading technology enterprise",
      recruiterId: recruiterOwner._id,
      isVerified: true,
      isDeleted: false,
    });
    createdCompanyIds.push(company._id);

    await CompanyRecruiter.create({
      companyId: company._id,
      recruiterProfileId: ownerProfile._id,
      role: "owner",
      isPrimary: true,
      isDeleted: false,
    });

    // 3. Setup Company Teammate Recruiter
    const recruiterTeammate = await User.create({
      name: "Recruiter Teammate",
      email: `recruiter_team_${timestamp}@example.com`,
      password: "Password123!",
      role: "recruiter",
      isEmailVerified: true,
    });
    createdUserIds.push(recruiterTeammate._id);

    const teammateProfile = await RecruiterProfile.create({
      userId: recruiterTeammate._id,
      companyId: company._id,
    });

    await CompanyRecruiter.create({
      companyId: company._id,
      recruiterProfileId: teammateProfile._id,
      role: "recruiter",
      isPrimary: false,
      isDeleted: false,
    });

    // 4. Setup Unauthorized Recruiter (Different Company)
    const recruiterUnauth = await User.create({
      name: "Unrelated Recruiter",
      email: `recruiter_unauth_${timestamp}@example.com`,
      password: "Password123!",
      role: "recruiter",
      isEmailVerified: true,
    });
    createdUserIds.push(recruiterUnauth._id);

    const unauthProfile = await RecruiterProfile.create({
      userId: recruiterUnauth._id,
    });

    // 5. Setup Blocked Recruiter
    const recruiterBlocked = await User.create({
      name: "Blocked Recruiter",
      email: `recruiter_blocked_${timestamp}@example.com`,
      password: "Password123!",
      role: "recruiter",
      isEmailVerified: true,
      isBlocked: true,
    });
    createdUserIds.push(recruiterBlocked._id);

    // ─────────────────────────────────────────────────────────────
    // Jobs Setup
    // ─────────────────────────────────────────────────────────────
    // Active Job
    const activeJob: any = await Job.create({
      title: "Full Stack Engineer",
      description: "Exciting opportunity",
      company: company.name,
      companyId: company._id,
      location: "San Francisco, CA",
      salaryMin: 120000,
      salaryMax: 160000,
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.THREE_TO_FIVE_YEARS,
      status: JOB_STATUS.ACTIVE,
      recruiterId: recruiterOwner._id,
      isDeleted: false,
    });
    createdJobIds.push(activeJob._id);

    // Soft-Deleted Job
    const deletedJob: any = await Job.create({
      title: "Deleted Job Position",
      description: "This job is deleted",
      company: company.name,
      companyId: company._id,
      location: "Remote",
      salaryMin: 100000,
      salaryMax: 140000,
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
      status: JOB_STATUS.ACTIVE,
      recruiterId: recruiterOwner._id,
      isDeleted: true,
    });
    createdJobIds.push(deletedJob._id);

    // Expired Job
    const expiredJob: any = await Job.create({
      title: "Expired Job Position",
      description: "This job has expired",
      company: company.name,
      companyId: company._id,
      location: "Remote",
      salaryMin: 100000,
      salaryMax: 140000,
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
      status: JOB_STATUS.ACTIVE,
      recruiterId: recruiterOwner._id,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // yesterday
      isDeleted: false,
    });
    createdJobIds.push(expiredJob._id);

    // Closed Job
    const closedJob: any = await Job.create({
      title: "Closed Job Position",
      description: "This job is closed",
      company: company.name,
      companyId: company._id,
      location: "Remote",
      salaryMin: 100000,
      salaryMax: 140000,
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
      status: JOB_STATUS.CLOSED,
      recruiterId: recruiterOwner._id,
      isDeleted: false,
    });
    createdJobIds.push(closedJob._id);

    // Job by Blocked Recruiter
    const jobByBlocked: any = await Job.create({
      title: "Job by Blocked Recruiter",
      description: "Job by suspended recruiter",
      company: "Bad Company",
      location: "Remote",
      salaryMin: 90000,
      salaryMax: 110000,
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.FRESHER,
      status: JOB_STATUS.ACTIVE,
      recruiterId: recruiterBlocked._id,
      isDeleted: false,
    });
    createdJobIds.push(jobByBlocked._id);

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Apply to Active Job (Happy Path)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 1: Apply to Active Job ---");
    const app1 = await applyForJob(activeJob._id.toString(), candidate._id.toString(), {
      coverLetter: "I would love to join your engineering team.",
      applicantName: "Test Candidate",
      experienceYears: 5,
      relevantSkills: ["Node.js", "TypeScript"],
    });
    assert(Boolean(app1 && app1._id && app1.status === APPLICATION_STATUS.APPLIED), "Candidate successfully applied to active job");

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Apply to Soft-Deleted Job (P0-1)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 2: Apply to Soft-Deleted Job ---");
    let delJobCaught = false;
    try {
      await applyForJob(deletedJob._id.toString(), candidate._id.toString(), {});
    } catch (err: any) {
      delJobCaught = err.message.includes("Job not found") || err.statusCode === 404;
    }
    assert(delJobCaught, "Applying to soft-deleted job is rejected with 404 Not Found");

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Apply to Expired Job (P0-1)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 3: Apply to Expired Job ---");
    let expJobCaught = false;
    try {
      await applyForJob(expiredJob._id.toString(), candidate._id.toString(), {});
    } catch (err: any) {
      expJobCaught = err.message.includes("expired") || err.statusCode === 400;
    }
    assert(expJobCaught, "Applying to expired job is rejected with 400 Bad Request");

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Apply to Closed Job (P0-1)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 4: Apply to Closed Job ---");
    let closedJobCaught = false;
    try {
      await applyForJob(closedJob._id.toString(), candidate._id.toString(), {});
    } catch (err: any) {
      closedJobCaught = err.message.includes("not accepting applications") || err.statusCode === 400;
    }
    assert(closedJobCaught, "Applying to closed job is rejected with 400 Bad Request");

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Apply to Blocked Recruiter's Job (P1-10)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 5: Apply to Job of Blocked Recruiter ---");
    let blockedRecruiterCaught = false;
    try {
      await applyForJob(jobByBlocked._id.toString(), candidate._id.toString(), {});
    } catch (err: any) {
      blockedRecruiterCaught = err.message.includes("no longer available") || err.statusCode === 400;
    }
    assert(blockedRecruiterCaught, "Applying to job by blocked recruiter is rejected with 400 Bad Request");

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Company Recruiter / Teammate Self-Application (P1-9)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 6: Company Recruiter Self-Application ---");
    let directOwnerApplyCaught = false;
    try {
      await applyForJob(activeJob._id.toString(), recruiterOwner._id.toString(), {});
    } catch (err: any) {
      directOwnerApplyCaught = err.message.includes("cannot apply to their own jobs") || err.statusCode === 403;
    }
    assert(directOwnerApplyCaught, "Direct job owner recruiter applying is rejected with 403 Forbidden");

    let teamMemberApplyCaught = false;
    try {
      await applyForJob(activeJob._id.toString(), recruiterTeammate._id.toString(), {});
    } catch (err: any) {
      teamMemberApplyCaught = err.message.includes("Company team members cannot apply") || err.statusCode === 403;
    }
    assert(teamMemberApplyCaught, "Company teammate recruiter applying to company job is rejected with 403 Forbidden");

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Duplicate Application & Race Handling (P0-4)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 7: Duplicate Application & Race Condition Defense ---");
    let duplicateCaught = false;
    try {
      await applyForJob(activeJob._id.toString(), candidate._id.toString(), {});
    } catch (err: any) {
      duplicateCaught = err.statusCode === 409 && err.message.includes("already applied");
    }
    assert(duplicateCaught, "Duplicate application throws clean HTTP 409 Conflict");

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Recruiter Owner & Company Teammate Access (P0-2)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 8: Recruiter Authorization & Multi-Recruiter Access ---");
    // Owner can access
    const ownerApps = await getJobApplications(activeJob._id.toString(), recruiterOwner._id.toString());
    assert(Array.isArray(ownerApps) && ownerApps.length === 1, "Job owner recruiter can view applications");

    // Teammate from same company can access
    const teamApps = await getJobApplications(activeJob._id.toString(), recruiterTeammate._id.toString());
    assert(Array.isArray(teamApps) && teamApps.length === 1, "Authorized company teammate can view applications");

    // Teammate can view in getRecruiterApplications across company jobs
    const allTeamApps = await getRecruiterApplications(recruiterTeammate._id.toString());
    assert(Array.isArray(allTeamApps) && allTeamApps.length >= 1, "Teammate sees company applications in getRecruiterApplications");

    // Unauthorized recruiter is forbidden
    let unauthCaught = false;
    try {
      await getJobApplications(activeJob._id.toString(), recruiterUnauth._id.toString());
    } catch (err: any) {
      unauthCaught = err.statusCode === 403 && err.message.includes("not authorized");
    }
    assert(unauthCaught, "Unrelated recruiter is rejected with 403 Forbidden");

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Status Transitions & State Machine (P1-6)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 9: Status State Machine Validation ---");
    // Step 9.1: Applied -> Under Review (VALID)
    const underReviewApp = await updateApplicationStatus(
      app1._id.toString(),
      recruiterTeammate._id.toString(), // Teammate updating status
      APPLICATION_STATUS.UNDER_REVIEW
    );
    assert(underReviewApp.status === APPLICATION_STATUS.UNDER_REVIEW, "Valid transition: Applied -> Under Review");

    // Step 9.2: Under Review -> Applied (INVALID REGRESSION)
    let invalidRegressCaught = false;
    try {
      await updateApplicationStatus(
        app1._id.toString(),
        recruiterOwner._id.toString(),
        APPLICATION_STATUS.APPLIED
      );
    } catch (err: any) {
      invalidRegressCaught = err.statusCode === 400 && err.message.includes("Cannot transition");
    }
    assert(invalidRegressCaught, "Invalid regressive transition Under Review -> Applied is rejected with 400");

    // Step 9.3: Under Review -> Shortlisted (VALID)
    const shortlistedApp = await updateApplicationStatus(
      app1._id.toString(),
      recruiterOwner._id.toString(),
      APPLICATION_STATUS.SHORTLISTED
    );
    assert(shortlistedApp.status === APPLICATION_STATUS.SHORTLISTED, "Valid transition: Under Review -> Shortlisted");

    // ─────────────────────────────────────────────────────────────
    // TEST 10: Interview Details Validation (P1-7)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 10: Interview Scheduling & Details Validation ---");
    // Transition to Interview WITHOUT date/time (INVALID)
    let interviewNoDetailsCaught = false;
    try {
      await updateApplicationStatus(
        app1._id.toString(),
        recruiterOwner._id.toString(),
        APPLICATION_STATUS.INTERVIEW
      );
    } catch (err: any) {
      interviewNoDetailsCaught = err.statusCode === 400 && err.message.includes("Interview date and time are required");
    }
    assert(interviewNoDetailsCaught, "Transitioning to Interview without valid details is rejected with 400");

    // Transition to Interview WITH valid details (VALID)
    const interviewApp = await updateApplicationStatus(
      app1._id.toString(),
      recruiterOwner._id.toString(),
      APPLICATION_STATUS.INTERVIEW,
      {
        mode: "video",
        date: "2026-09-01",
        time: "14:00",
        locationOrLink: "https://meet.google.com/xyz-abc",
        notes: "Technical round",
      }
    );
    assert(
      interviewApp.status === APPLICATION_STATUS.INTERVIEW && interviewApp.interviewDetails?.date === "2026-09-01",
      "Valid transition to Interview with valid date/time and meeting link succeeds"
    );

    // Attempt regressive transition: Interview -> Shortlisted (INVALID)
    let interviewToShortlistedCaught = false;
    try {
      await updateApplicationStatus(
        app1._id.toString(),
        recruiterOwner._id.toString(),
        APPLICATION_STATUS.SHORTLISTED
      );
    } catch (err: any) {
      interviewToShortlistedCaught = err.statusCode === 400 && err.message.includes("Cannot transition");
    }
    assert(interviewToShortlistedCaught, "Regressive transition Interview -> Shortlisted is rejected with 400 Bad Request");

    // Transition to Hired (VALID)
    const hiredApp = await updateApplicationStatus(
      app1._id.toString(),
      recruiterOwner._id.toString(),
      APPLICATION_STATUS.HIRED
    );
    assert(hiredApp.status === APPLICATION_STATUS.HIRED, "Valid transition: Interview -> Hired");

    // Attempt modifying finalized status (INVALID)
    let finalizedCaught = false;
    try {
      await updateApplicationStatus(
        app1._id.toString(),
        recruiterOwner._id.toString(),
        APPLICATION_STATUS.REJECTED
      );
    } catch (err: any) {
      finalizedCaught = err.statusCode === 409 && err.message.includes("finalized application");
    }
    assert(finalizedCaught, "Modifying finalized (Hired) application is rejected with 409 Conflict");

    // ─────────────────────────────────────────────────────────────
    // TEST 11: Candidate Dashboard Metrics & Under Review (P1-8)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 11: Candidate Dashboard Metrics ---");
    // Create another candidate to test UNDER_REVIEW dashboard metric
    const candidate2 = await User.create({
      name: "Candidate Two",
      email: `candidate2_${timestamp}@example.com`,
      password: "Password123!",
      role: "candidate",
      isEmailVerified: true,
    });
    createdUserIds.push(candidate2._id);

    await CandidateProfile.create({
      userId: candidate2._id,
      resumeUrl: "https://res.cloudinary.com/demo/image/upload/v1/sample2.pdf",
    });

    const app2 = await applyForJob(activeJob._id.toString(), candidate2._id.toString(), {});
    await updateApplicationStatus(app2._id.toString(), recruiterOwner._id.toString(), APPLICATION_STATUS.UNDER_REVIEW);

    const candidate2Dashboard = await getCandidateDashboard(candidate2._id.toString());
    assert(
      candidate2Dashboard.underReview === 1 && candidate2Dashboard.totalApplications === 1,
      `Candidate dashboard correctly counts underReview: ${candidate2Dashboard.underReview}, total: ${candidate2Dashboard.totalApplications}`
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 12: Candidate Withdrawal (Soft-Delete) & Re-Application (P0-3, P1-5)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 12: Candidate Withdrawal & Soft Delete Integrity ---");
    // Candidate 2 withdraws app2
    await withdrawApplication(app2._id.toString(), candidate2._id.toString());

    // Verify app2 is soft-deleted in DB (not hard-deleted)
    const rawApp2 = await Application.findById(app2._id);
    assert(Boolean(rawApp2 && rawApp2.isDeleted === true), "Withdrawn application is soft-deleted (isDeleted=true) in DB");

    // Verify getMyApplications does NOT return deleted applications
    const myApps2 = await getMyApplications(candidate2._id.toString());
    assert((myApps2 as any[]).length === 0, "getMyApplications excludes soft-deleted applications");

    // Verify recruiter application list does NOT return deleted applications
    const recruiterAppsAfterWithdraw = await getJobApplications(activeJob._id.toString(), recruiterOwner._id.toString());
    const hasDeleted = (recruiterAppsAfterWithdraw as any[]).some((a) => a._id.toString() === app2._id.toString());
    assert(!hasDeleted, "getJobApplications excludes soft-deleted applications");

    // Candidate 2 can cleanly re-apply after withdrawal without DB index crash
    const revivedApp2 = await applyForJob(activeJob._id.toString(), candidate2._id.toString(), {
      coverLetter: "Re-applying with updated details",
    });
    assert(
      Boolean(revivedApp2 && revivedApp2.isDeleted === false && revivedApp2.status === APPLICATION_STATUS.APPLIED),
      "Candidate can cleanly re-apply after withdrawal, reviving application document safely"
    );

    console.log("\n=============================================================");
    console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log("=============================================================");

    if (failed > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  } finally {
    // Cleanup created test data
    if (createdUserIds.length > 0) {
      await User.deleteMany({ _id: { $in: createdUserIds } });
      await CandidateProfile.deleteMany({ userId: { $in: createdUserIds } });
      await RecruiterProfile.deleteMany({ userId: { $in: createdUserIds } });
      await Application.deleteMany({ applicantId: { $in: createdUserIds } });
    }
    if (createdJobIds.length > 0) {
      await Job.deleteMany({ _id: { $in: createdJobIds } });
    }
    if (createdCompanyIds.length > 0) {
      await Company.deleteMany({ _id: { $in: createdCompanyIds } });
      await CompanyRecruiter.deleteMany({ companyId: { $in: createdCompanyIds } });
    }
    await mongoose.disconnect();
  }
}

runApplicationTests();
