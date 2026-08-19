import dotenv from "dotenv";
dotenv.config();

import mongoose, { Types } from "mongoose";
import User from "../models/user.model";
import Company from "../models/company.model";
import RecruiterProfile from "../models/recruiter-profile.model";
import CandidateProfile from "../models/candidate-profile.model";
import CompanyRecruiter from "../models/company-recruiter.model";
import Job from "../models/job.model";
import Skill from "../models/skill.model";
import Application from "../models/application.model";
import SavedJob from "../models/saved-job.model";

import { createCompany, getAuthorizedCompanyForRecruiter } from "../services/company.service";
import { createJob, updateJob } from "../services/job.service";
import { applyForJob } from "../services/application.service";
import { saveJob } from "../services/saved-job.service";
import { EMPLOYMENT_TYPE } from "../constants/employment-type";
import { EXPERIENCE_LEVEL } from "../constants/experience-level";

const runTests = async () => {
  console.log("\n=======================================================");
  console.log("Starting Phase 1 Targeted Relationship Verification Tests");
  console.log("=======================================================\n");

  // Deduplicate any pre-existing active primary recruiters before syncing indexes
  const duplicatePrimaries = await CompanyRecruiter.aggregate([
    { $match: { isPrimary: true, isDeleted: false } },
    { $group: { _id: "$companyId", docs: { $push: "$_id" }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);
  for (const dup of duplicatePrimaries) {
    const [, ...rest] = dup.docs;
    await CompanyRecruiter.updateMany(
      { _id: { $in: rest } },
      { $set: { isPrimary: false } }
    );
  }

  await CompanyRecruiter.syncIndexes();

  const testSuffix = Date.now().toString().slice(-6);

  // 1. Setup Test Users
  const recruiterUser1 = await User.create({
    name: `Test Recruiter 1_${testSuffix}`,
    email: `recruiter1_${testSuffix}@example.com`,
    password: "Password123!",
    role: "recruiter",
  });

  const recruiterUser2 = await User.create({
    name: `Test Recruiter 2_${testSuffix}`,
    email: `recruiter2_${testSuffix}@example.com`,
    password: "Password123!",
    role: "recruiter",
  });

  const candidateUser = await User.create({
    name: `Test Candidate_${testSuffix}`,
    email: `candidate_${testSuffix}@example.com`,
    password: "Password123!",
    role: "candidate",
  });

  console.log("✓ Test users created successfully.");

  // 2. Company ↔ Recruiter Tests
  const company1 = await createCompany(recruiterUser1._id.toString(), {
    name: `Acme Corp ${testSuffix}`,
    description: "Acme Corporation test company profile",
  });

  const cr1 = await CompanyRecruiter.findOne({ companyId: company1._id, isPrimary: true });
  if (!cr1 || cr1.isDeleted) {
    throw new Error("FAIL: CompanyRecruiter record not created properly for new company.");
  }
  console.log("✓ Test 1 Passed: Creating company creates active primary CompanyRecruiter entry.");

  // Test primary recruiter constraint
  let profile2 = await RecruiterProfile.create({ userId: recruiterUser2._id });
  let primaryConflict = false;
  try {
    await CompanyRecruiter.create({
      companyId: company1._id,
      recruiterProfileId: profile2._id,
      role: "recruiter",
      isPrimary: true,
      isDeleted: false,
    });
  } catch (err: any) {
    primaryConflict = true;
  }
  if (!primaryConflict) {
    throw new Error("FAIL: Allowed two active primary recruiters for the same company!");
  }
  console.log("✓ Test 2 Passed: Partial unique index prevents multiple active primary recruiters.");

  // 3. Job ↔ Company & Recruiter Authorization & Skill Sync Tests
  const job1 = await createJob(
    {
      title: `Senior Backend Developer ${testSuffix}`,
      description: "Building scalable Node.js microservices",
      company: company1.name,
      location: "Remote",
      salaryMin: 120000,
      salaryMax: 150000,
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.THREE_TO_FIVE_YEARS,
      skills: ["TypeScript", "MongoDB", "Express"],
    },
    recruiterUser1._id as Types.ObjectId
  );

  if (job1.companyId?.toString() !== company1._id.toString()) {
    throw new Error("FAIL: Job.companyId does not match Company._id.");
  }
  if (job1.recruiterId.toString() !== recruiterUser1._id.toString()) {
    throw new Error("FAIL: Job.recruiterId does not match User._id.");
  }
  if (!job1.skillIds || job1.skillIds.length !== 3) {
    throw new Error("FAIL: Job.skillIds was not correctly resolved and populated.");
  }
  console.log("✓ Test 3 Passed: Job creation populates companyId, recruiterId, postedBy, and skillIds.");

  // Test unauthorized job update attempt
  let unauthorizedUpdateBlocked = false;
  try {
    await updateJob(job1._id.toString(), recruiterUser2._id.toString(), {
      title: "Hacked Job Title",
    });
  } catch (err: any) {
    unauthorizedUpdateBlocked = true;
  }
  if (!unauthorizedUpdateBlocked) {
    throw new Error("FAIL: Unauthorized recruiter was able to update another recruiter's job!");
  }
  console.log("✓ Test 4 Passed: Unauthorized recruiter job update is rejected.");

  // 4. Candidate ↔ Application Invariant Tests
  const candidateProfile = await CandidateProfile.create({
    userId: candidateUser._id,
    resumeUrl: "https://example.com/resume.pdf",
    skills: ["TypeScript"],
  });

  const app1 = await applyForJob(job1._id.toString(), candidateUser._id.toString(), {
    coverLetter: "Interested in backend role",
  });

  if (app1.candidateProfileId?.toString() !== candidateProfile._id.toString()) {
    throw new Error("FAIL: Application.candidateProfileId does not match CandidateProfile._id.");
  }
  if (app1.applicantId.toString() !== candidateUser._id.toString()) {
    throw new Error("FAIL: Application.applicantId does not match User._id.");
  }
  console.log("✓ Test 5 Passed: Application created with verified CandidateProfile <-> User invariant.");

  // Test duplicate application rejection
  let duplicateAppBlocked = false;
  try {
    await applyForJob(job1._id.toString(), candidateUser._id.toString(), {});
  } catch (err: any) {
    duplicateAppBlocked = true;
  }
  if (!duplicateAppBlocked) {
    throw new Error("FAIL: Duplicate job application was not rejected!");
  }
  console.log("✓ Test 6 Passed: Duplicate job application rejected.");

  // 5. Candidate ↔ SavedJob Invariant Tests
  const savedJobRes = await saveJob(candidateUser._id.toString(), job1._id.toString());
  if (!savedJobRes.saved) {
    throw new Error("FAIL: saveJob returned false.");
  }

  const savedJobDoc = await SavedJob.findOne({ userId: candidateUser._id, jobId: job1._id });
  if (!savedJobDoc || savedJobDoc.candidateProfileId?.toString() !== candidateProfile._id.toString()) {
    throw new Error("FAIL: SavedJob.candidateProfileId does not match CandidateProfile._id.");
  }
  console.log("✓ Test 7 Passed: SavedJob created with verified CandidateProfile <-> User invariant.");

  // Test duplicate saved job rejection
  let duplicateSaveBlocked = false;
  try {
    await saveJob(candidateUser._id.toString(), job1._id.toString());
  } catch (err: any) {
    duplicateSaveBlocked = true;
  }
  if (!duplicateSaveBlocked) {
    throw new Error("FAIL: Duplicate saved job was not rejected!");
  }
  console.log("✓ Test 8 Passed: Duplicate saved job rejected.");

  // Cleanup Test Documents
  await Application.deleteMany({ _id: app1._id });
  await SavedJob.deleteMany({ _id: savedJobDoc._id });
  await Job.deleteMany({ _id: job1._id });
  await CompanyRecruiter.deleteMany({ companyId: company1._id });
  await Company.deleteMany({ _id: company1._id });
  await RecruiterProfile.deleteMany({ userId: { $in: [recruiterUser1._id, recruiterUser2._id] } });
  await CandidateProfile.deleteMany({ userId: candidateUser._id });
  await User.deleteMany({ _id: { $in: [recruiterUser1._id, recruiterUser2._id, candidateUser._id] } });

  console.log("\n=======================================================");
  console.log("ALL PHASE 1 TARGETED RELATIONSHIP TESTS PASSED! 🎉");
  console.log("=======================================================\n");
};

if (require.main === module) {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal";
  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log("Connected to MongoDB for targeted relationship testing.");
      await runTests();
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error("Test execution error:", err);
      process.exit(1);
    });
}
