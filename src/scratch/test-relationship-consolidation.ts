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
import { APPLICATION_STATUS } from "../constants/application-status";
import { JOB_STATUS } from "../constants/job-status";
import { EMPLOYMENT_TYPE } from "../constants/employment-type";
import { EXPERIENCE_LEVEL } from "../constants/experience-level";
import { USER_ROLES } from "../constants/roles";
import {
  createJob,
  getJobs,
  getMyJobs,
  getJobById,
  updateJob,
} from "../services/job.service";
import {
  applyForJob,
  getJobApplications,
  getRecruiterApplications,
  updateApplicationStatus,
} from "../services/application.service";
import {
  createOrGetConversation,
  createMessage,
} from "../services/chat.service";

async function runRelationshipTests() {
  console.log("================================================================");
  console.log("   PHASE 1 RELATIONSHIP READ CONSOLIDATION VERIFICATION SUITE   ");
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

  const testSuffix = `rel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  try {
    // -------------------------------------------------------------------------
    // SETUP FIXTURES
    // -------------------------------------------------------------------------
    // 1. Recruiter Owner (Creator of Company)
    const recruiterOwner = await User.create({
      name: `Owner Recruiter ${testSuffix}`,
      email: `owner_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.RECRUITER,
      isEmailVerified: true,
    });

    const ownerProfile = await RecruiterProfile.create({
      userId: recruiterOwner._id,
      designation: "Head of Talent",
    });

    const company = await Company.create({
      name: `Enterprise Org ${testSuffix}`,
      description: "Fast-growing unicorn enterprise",
      recruiterId: recruiterOwner._id,
      isVerified: true,
    });

    // Authoritative link: CompanyRecruiter
    await CompanyRecruiter.create({
      companyId: company._id,
      recruiterProfileId: ownerProfile._id,
      role: "owner",
      isPrimary: true,
      isDeleted: false,
    });

    // 2. Company Teammate Recruiter (Member of the same company)
    const recruiterTeammate = await User.create({
      name: `Teammate Recruiter ${testSuffix}`,
      email: `teammate_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.RECRUITER,
      isEmailVerified: true,
    });

    const teammateProfile = await RecruiterProfile.create({
      userId: recruiterTeammate._id,
      designation: "Senior Technical Sourcer",
    });

    await CompanyRecruiter.create({
      companyId: company._id,
      recruiterProfileId: teammateProfile._id,
      role: "recruiter",
      isPrimary: false,
      isDeleted: false,
    });

    // 3. Unauthorized External Recruiter (Belongs to different company)
    const externalRecruiter = await User.create({
      name: `External Recruiter ${testSuffix}`,
      email: `external_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.RECRUITER,
      isEmailVerified: true,
    });

    const externalProfile = await RecruiterProfile.create({
      userId: externalRecruiter._id,
      designation: "Independent Headhunter",
    });

    const otherCompany = await Company.create({
      name: `Competitor Org ${testSuffix}`,
      description: "Another firm",
      recruiterId: externalRecruiter._id,
      isVerified: true,
    });

    await CompanyRecruiter.create({
      companyId: otherCompany._id,
      recruiterProfileId: externalProfile._id,
      role: "owner",
      isPrimary: true,
      isDeleted: false,
    });

    // 4. Candidate
    const candidateUser = await User.create({
      name: `Candidate ${testSuffix}`,
      email: `candidate_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.CANDIDATE,
      isEmailVerified: true,
    });

    await CandidateProfile.create({
      userId: candidateUser._id,
      skills: ["Go", "Distributed Systems", "MongoDB"],
      resumeUrl: "https://example.com/resumes/cand.pdf",
    });

    // =========================================================================
    // TEST SECTION 1: JOB CREATION & CANONICAL OWNERSHIP
    // =========================================================================
    console.log("\n--- [1] Job Creation & Canonical Ownership ---");

    const createdJob = await createJob(
      {
        title: `Principal Cloud Architect ${testSuffix}`,
        description: "Architect high scale cloud systems.",
        company: company.name,
        location: "Seattle, WA",
        salaryMin: 180000,
        salaryMax: 240000,
        employmentType: EMPLOYMENT_TYPE.FULL_TIME,
        experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
        status: JOB_STATUS.ACTIVE,
        skills: ["Go", "MongoDB"],
      },
      recruiterOwner._id as Types.ObjectId
    );

    assert(
      createdJob.recruiterId.toString() === recruiterOwner._id.toString() &&
      createdJob.companyId?.toString() === company._id.toString() &&
      createdJob.company === company.name,
      "Job.recruiterId stores canonical User._id and Job.companyId stores canonical Company._id"
    );

    // =========================================================================
    // TEST SECTION 2: CANDIDATE APPLIES & STARTS CHAT FROM JOB (CHAT CANONICAL READ)
    // =========================================================================
    console.log("\n--- [2] Chat Service Canonical Recruiter Identity ---");

    // Candidate applies to the job (application gating requirement)
    const app = await applyForJob(createdJob._id.toString(), candidateUser._id.toString(), {
      coverLetter: "My qualifications match the required distributed systems experience.",
      resumeUrl: "https://example.com/resumes/cand.pdf",
    });

    // Candidate initiates chat from Job listing
    const conversation = await createOrGetConversation(
      createdJob._id.toString(),
      recruiterOwner._id.toString(), // target
      candidateUser._id.toString()  // current
    );

    const convCandidateId = (conversation.candidateId as any)._id?.toString() || conversation.candidateId.toString();
    const convRecruiterId = (conversation.recruiterId as any)._id?.toString() || conversation.recruiterId.toString();
    const convJobId = (conversation.jobId as any)?._id?.toString() || conversation.jobId?.toString() || "";

    assert(
      convCandidateId === candidateUser._id.toString() &&
      convRecruiterId === recruiterOwner._id.toString() &&
      convJobId === createdJob._id.toString(),
      "Conversation stores canonical User._id for both candidateId and recruiterId (No RecruiterProfile._id pollution)"
    );

    // Verify Conversation can properly populate User documents
    const candidateDoc = conversation.candidateId as any;
    const recruiterDoc = conversation.recruiterId as any;

    assert(
      candidateDoc?.email === candidateUser.email &&
      recruiterDoc?.email === recruiterOwner.email,
      "Conversation successfully populates User documents for both candidate and recruiter"
    );

    // Send message between candidate and recruiter
    const sentMsg = await createMessage(
      conversation._id.toString(),
      candidateUser._id.toString(),
      "Hello! I am very interested in this Principal Cloud Architect role."
    );
    const msgSenderId = (sentMsg.senderId as any)._id?.toString() || sentMsg.senderId.toString();
    assert(
      sentMsg.message.includes("Principal Cloud Architect") &&
      msgSenderId === candidateUser._id.toString(),
      "Message successfully sent and bound to canonical conversation"
    );

    // =========================================================================
    // TEST SECTION 3: MULTI-RECRUITER COMPANY TEAMMATE AUTHORIZATION
    // =========================================================================
    console.log("\n--- [3] Company Teammate Authorization via CompanyRecruiter ---");

    // 3.1 Owner recruiter can view job applications
    const ownerAppsResult: any = await getJobApplications(createdJob._id.toString(), recruiterOwner._id.toString());
    const ownerApps = Array.isArray(ownerAppsResult) ? ownerAppsResult : (ownerAppsResult.data || ownerAppsResult.applications || []);
    assert(ownerApps.length === 1, "Direct job owner recruiter can view job applications");

    // 3.2 Company teammate recruiter (who did NOT post the job) can view job applications via CompanyRecruiter
    const teammateAppsResult: any = await getJobApplications(createdJob._id.toString(), recruiterTeammate._id.toString());
    const teammateApps = Array.isArray(teammateAppsResult) ? teammateAppsResult : (teammateAppsResult.data || teammateAppsResult.applications || []);
    assert(teammateApps.length === 1, "Company teammate recruiter can view company job applications via CompanyRecruiter");

    // 3.3 Company teammate sees job in getRecruiterApplications feed
    const teammateAllAppsResult: any = await getRecruiterApplications(recruiterTeammate._id.toString());
    const teammateAllApps = Array.isArray(teammateAllAppsResult) ? teammateAllAppsResult : (teammateAllAppsResult.data || teammateAllAppsResult.applications || []);
    assert(teammateAllApps.length >= 1, "Company teammate sees team applications in getRecruiterApplications");

    // 3.4 Company teammate can update application status
    const updatedByTeammate = await updateApplicationStatus(
      app._id.toString(),
      recruiterTeammate._id.toString(),
      APPLICATION_STATUS.UNDER_REVIEW
    );
    assert(
      updatedByTeammate.status === APPLICATION_STATUS.UNDER_REVIEW,
      "Company teammate successfully updates application status via CompanyRecruiter team authorization"
    );

    // 3.5 Company teammate can update job listing
    const updatedJob = await updateJob(
      createdJob._id.toString(),
      recruiterTeammate._id.toString(),
      { title: `Principal Cloud Architect - Updated ${testSuffix}` }
    );
    assert(
      updatedJob.title.includes("Updated"),
      "Company teammate can update job listing details via CompanyRecruiter team authorization"
    );

    // =========================================================================
    // TEST SECTION 4: UNAUTHORIZED RECRUITER BLOCKED
    // =========================================================================
    console.log("\n--- [4] Unauthorized Recruiter Access Control ---");

    let externalViewBlocked = false;
    try {
      await getJobApplications(createdJob._id.toString(), externalRecruiter._id.toString());
    } catch (e: any) {
      externalViewBlocked = e.statusCode === 403 || e.message.includes("not authorized");
    }
    assert(externalViewBlocked, "External recruiter from different company is blocked from viewing applications with 403 Forbidden");

    let externalUpdateBlocked = false;
    try {
      await updateApplicationStatus(app._id.toString(), externalRecruiter._id.toString(), APPLICATION_STATUS.SHORTLISTED);
    } catch (e: any) {
      externalUpdateBlocked = e.statusCode === 403 || e.message.includes("not authorized");
    }
    assert(externalUpdateBlocked, "External recruiter is blocked from modifying applications with 403 Forbidden");

    let externalJobUpdateBlocked = false;
    try {
      await updateJob(createdJob._id.toString(), externalRecruiter._id.toString(), { title: "Hijacked Job" });
    } catch (e: any) {
      externalJobUpdateBlocked = e.statusCode === 403 || e.message.includes("not allowed");
    }
    assert(externalJobUpdateBlocked, "External recruiter is blocked from modifying jobs with 403 Forbidden");

    // =========================================================================
    // TEST SECTION 5: JOB LISTINGS & CARDS RECRUITERID POPULATION
    // =========================================================================
    console.log("\n--- [5] Job Feed & Public Details recruiterId Population ---");

    const publicJob = await getJobById(createdJob._id.toString());
    const publicRecruiter = publicJob.recruiterId as any;

    assert(
      publicRecruiter &&
      publicRecruiter._id?.toString() === recruiterOwner._id.toString() &&
      publicRecruiter.name === recruiterOwner.name &&
      publicRecruiter.email === recruiterOwner.email,
      "getJobById correctly populates recruiterId with full User details (name, email) for public card rendering"
    );

    const publicJobsFeed = await getJobs({ search: testSuffix });
    const feedJob = publicJobsFeed.jobs.find((j: any) => j._id.toString() === createdJob._id.toString());
    const feedRecruiter = feedJob?.recruiterId as any;

    assert(
      feedRecruiter &&
      feedRecruiter._id?.toString() === recruiterOwner._id.toString() &&
      feedRecruiter.name === recruiterOwner.name,
      "getJobs feed correctly populates recruiterId for frontend job card grid"
    );

    const myJobs = await getMyJobs(recruiterOwner._id.toString());
    assert(
      myJobs.length === 1 && myJobs[0]._id.toString() === createdJob._id.toString(),
      "getMyJobs finds jobs directly by canonical recruiterId (User._id)"
    );

  } finally {
    // Cleanup fixtures
    console.log("\n Cleaning up test fixtures...");
    await User.deleteMany({ email: { $regex: testSuffix } });
    await RecruiterProfile.deleteMany({ designation: { $regex: "Talent|Sourcer|Headhunter" } });
    await Company.deleteMany({ name: { $regex: testSuffix } });
    await CompanyRecruiter.deleteMany({ role: { $in: ["owner", "recruiter"] } });
    await CandidateProfile.deleteMany({ skills: "Go" });
    await Job.deleteMany({ title: { $regex: testSuffix } });
    await Application.deleteMany({ coverLetter: { $regex: "distributed systems" } });
    await Conversation.deleteMany({ jobId: { $exists: true } });
    await Message.deleteMany({ message: { $regex: "Principal Cloud Architect" } });

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

runRelationshipTests().catch((err) => {
  console.error("Test Suite crashed with unhandled error:", err);
  process.exit(1);
});
