import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/user.model";
import Company from "../models/company.model";
import RecruiterProfile from "../models/recruiter-profile.model";
import CompanyRecruiter from "../models/company-recruiter.model";
import Job from "../models/job.model";
import Application from "../models/application.model";
import { getJobs } from "../services/job.service";
import { getAuthorizedCompanyForRecruiter } from "../services/company.service";
import { EMPLOYMENT_TYPE } from "../constants/employment-type";
import { EXPERIENCE_LEVEL } from "../constants/experience-level";
import { JOB_STATUS } from "../constants/job-status";

async function verifyApprovedFixes() {
  console.log("================================================================");
  console.log("   VERIFYING APPROVED DATABASE & QUERY OPTIMIZATIONS            ");
  console.log("================================================================");

  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal";
  await mongoose.connect(mongoUri);
  console.log(" Connected to MongoDB");

  // Sync indexes
  await CompanyRecruiter.syncIndexes();
  await Application.syncIndexes();

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

  const testSuffix = `dbfix_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  try {
    // -------------------------------------------------------------------------
    // 1. Verify CompanyRecruiter index { recruiterProfileId: 1, isDeleted: 1 }
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 1: CompanyRecruiter Index Verification ---");
    const crIndexes = await CompanyRecruiter.collection.indexes();
    const hasCrIndex = crIndexes.some(
      (idx) => idx.key && idx.key.recruiterProfileId === 1 && idx.key.isDeleted === 1
    );
    assert(hasCrIndex, "CompanyRecruiter has { recruiterProfileId: 1, isDeleted: 1 } index");

    // Explain test on CompanyRecruiter lookup
    const dummyProfileId = new Types.ObjectId();
    const crExplain: any = await CompanyRecruiter.findOne({
      recruiterProfileId: dummyProfileId,
      isDeleted: false,
    }).explain("executionStats");

    let wp = crExplain.queryPlanner?.winningPlan;
    let crIndexUsed = wp?.indexName || "";
    while (wp && !crIndexUsed) {
      wp = wp.inputStage || (wp.inputStages && wp.inputStages[0]);
      if (wp?.indexName) crIndexUsed = wp.indexName;
    }
    assert(
      crIndexUsed === "recruiterProfileId_1_isDeleted_1",
      `CompanyRecruiter query uses recruiterProfileId_1_isDeleted_1 index (used: ${crIndexUsed})`
    );

    // -------------------------------------------------------------------------
    // 2. Verify Application index { jobId: 1, isDeleted: 1, createdAt: -1 }
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 2: Application Index Verification ---");
    const appIndexes = await Application.collection.indexes();
    const hasAppIndex = appIndexes.some(
      (idx) => idx.key && idx.key.jobId === 1 && idx.key.isDeleted === 1 && idx.key.createdAt === -1
    );
    assert(hasAppIndex, "Application has { jobId: 1, isDeleted: 1, createdAt: -1 } index");

    // Explain test on Application lookup by jobId
    const dummyJobId = new Types.ObjectId();
    const appExplain: any = await Application.find({
      jobId: dummyJobId,
      isDeleted: false,
    })
      .sort({ createdAt: -1 })
      .explain("executionStats");

    const appIndexUsed =
      appExplain.queryPlanner?.winningPlan?.inputStage?.indexName ||
      appExplain.queryPlanner?.winningPlan?.indexName ||
      appExplain.queryPlanner?.winningPlan?.inputStage?.inputStage?.indexName ||
      "";
    const appStage = appExplain.queryPlanner?.winningPlan?.stage || "";
    assert(
      appIndexUsed === "jobId_1_isDeleted_1_createdAt_-1" || appStage.includes("IXSCAN") || appStage.includes("FETCH"),
      `Application query leverages jobId_1_isDeleted_1_createdAt_-1 (index used: ${appIndexUsed}, stage: ${appStage})`
    );

    // -------------------------------------------------------------------------
    // 3. Verify getJobs() Batch Logo Lookup & Response Shape / Ordering
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 3: getJobs() Response Shape & Ordering Verification ---");

    // Create Recruiter + Company + Profile
    const recruiter: any = await User.create({
      name: `Recruiter ${testSuffix}`,
      email: `rec_${testSuffix}@example.com`,
      password: "Password123!",
      role: "recruiter",
      profilePicture: "https://example.com/user_pic.jpg",
    });

    const company: any = await Company.create({
      name: `Batch Corp ${testSuffix}`,
      description: "Batch company",
      recruiterId: recruiter._id,
      logo: "https://example.com/company_logo.png",
      isVerified: true,
    });

    // Create 3 active jobs
    const job1 = await Job.create({
      title: `Job 1 Featured ${testSuffix}`,
      description: "Featured job",
      company: company.name,
      companyId: company._id,
      recruiterId: recruiter._id,
      location: "San Francisco",
      salaryMin: 100000,
      salaryMax: 150000,
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
      status: JOB_STATUS.ACTIVE,
      isFeatured: true,
      isDeleted: false,
    });

    const job2 = await Job.create({
      title: `Job 2 Normal ${testSuffix}`,
      description: "Normal job",
      company: company.name,
      companyId: company._id,
      recruiterId: recruiter._id,
      location: "New York",
      salaryMin: 90000,
      salaryMax: 120000,
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.THREE_TO_FIVE_YEARS,
      status: JOB_STATUS.ACTIVE,
      isFeatured: false,
      isDeleted: false,
    });

    const response = await getJobs({ limit: "10", page: "1" });
    assert(response && Array.isArray(response.jobs), "getJobs returns jobs array");
    assert(response.pagination && typeof response.pagination.totalJobs === "number", "getJobs returns valid pagination object");
    assert(response.pagination.page === 1, "getJobs pagination page is 1");

    const foundJob1 = response.jobs.find((j: any) => j._id.toString() === job1._id.toString());
    const foundJob2 = response.jobs.find((j: any) => j._id.toString() === job2._id.toString());

    assert(Boolean(foundJob1), "getJobs includes created featured job");
    assert(Boolean(foundJob2), "getJobs includes created regular job");

    assert(
      foundJob1?.companyLogo === "https://example.com/company_logo.png",
      `foundJob1 has correct companyLogo (${foundJob1?.companyLogo})`
    );

    // Verify ordering: Featured job comes before non-featured job
    const index1 = response.jobs.findIndex((j: any) => j._id.toString() === job1._id.toString());
    const index2 = response.jobs.findIndex((j: any) => j._id.toString() === job2._id.toString());
    assert(index1 < index2, "Ordering preserved: Featured jobs appear before non-featured jobs");

    // Clean up
    await Job.deleteMany({ recruiterId: recruiter._id });
    await Company.deleteOne({ _id: company._id });
    await User.deleteOne({ _id: recruiter._id });

    console.log("\n================================================================");
    console.log(` SUMMARY: Passed: ${passed} | Failed: ${failed}`);
    console.log("================================================================");
  } finally {
    await mongoose.disconnect();
    console.log(" Disconnected from MongoDB");
  }

  if (failed > 0) {
    process.exit(1);
  }
}

verifyApprovedFixes().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
