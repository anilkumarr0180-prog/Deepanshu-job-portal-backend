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
import { JOB_STATUS } from "../constants/job-status";
import { EMPLOYMENT_TYPE } from "../constants/employment-type";
import { EXPERIENCE_LEVEL } from "../constants/experience-level";
import { APPLICATION_STATUS } from "../constants/application-status";
import { USER_ROLES } from "../constants/roles";
import { getJobById } from "../services/job.service";
import { getAuthenticatedResumeUrl } from "../controllers/upload.controller";

// Mock Express Response
function createMockResponse() {
  const res: any = {
    statusCode: 200,
    data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(data: any) {
      this.data = data;
      return this;
    },
  };
  return res;
}

async function runAuthAuditTests() {
  console.log("================================================================");
  console.log("       AUTHORIZATION AUDIT VERIFICATION TEST SUITE              ");
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

  const testSuffix = `auth_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  try {
    // -------------------------------------------------------------------------
    // SETUP FIXTURES
    // -------------------------------------------------------------------------
    // 1. Recruiter Owner of Company A
    const recruiterOwnerA: any = await User.create({
      name: `Owner Recruiter A ${testSuffix}`,
      email: `ownerA_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.RECRUITER,
      isEmailVerified: true,
    });
    const profileOwnerA: any = await RecruiterProfile.create({
      userId: recruiterOwnerA._id,
      designation: "Head of Engineering",
    });

    const companyA: any = await Company.create({
      name: `Acme Corp ${testSuffix}`,
      description: "Acme Corporation",
      recruiterId: recruiterOwnerA._id,
      isVerified: true,
    });

    await CompanyRecruiter.create({
      companyId: companyA._id,
      recruiterProfileId: profileOwnerA._id,
      role: "owner",
      isPrimary: true,
      isDeleted: false,
    });

    // 2. Recruiter Teammate of Company A
    const recruiterTeammateA: any = await User.create({
      name: `Teammate Recruiter A ${testSuffix}`,
      email: `teammateA_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.RECRUITER,
      isEmailVerified: true,
    });
    const profileTeammateA: any = await RecruiterProfile.create({
      userId: recruiterTeammateA._id,
      designation: "Tech Recruiter",
    });

    await CompanyRecruiter.create({
      companyId: companyA._id,
      recruiterProfileId: profileTeammateA._id,
      role: "recruiter",
      isPrimary: false,
      isDeleted: false,
    });

    // 3. Recruiter of Company B (External)
    const recruiterCompanyB: any = await User.create({
      name: `External Recruiter B ${testSuffix}`,
      email: `recruiterB_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.RECRUITER,
      isEmailVerified: true,
    });
    const profileRecruiterB: any = await RecruiterProfile.create({
      userId: recruiterCompanyB._id,
      designation: "Recruiter B",
    });

    const companyB: any = await Company.create({
      name: `Beta Inc ${testSuffix}`,
      description: "Beta Inc",
      recruiterId: recruiterCompanyB._id,
      isVerified: true,
    });

    await CompanyRecruiter.create({
      companyId: companyB._id,
      recruiterProfileId: profileRecruiterB._id,
      role: "owner",
      isPrimary: true,
      isDeleted: false,
    });

    // 4. Candidate User
    const candidateUser: any = await User.create({
      name: `Candidate ${testSuffix}`,
      email: `candidate_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.CANDIDATE,
      isEmailVerified: true,
    });
    const candidateResumePublicId = `resumes/cand_${testSuffix}`;
    await CandidateProfile.create({
      userId: candidateUser._id,
      resumePublicId: candidateResumePublicId,
      resumeUrl: "https://cloudinary.com/fake-resume.pdf",
    });

    // Another Candidate User
    const candidateUser2: any = await User.create({
      name: `Other Candidate ${testSuffix}`,
      email: `candidate2_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.CANDIDATE,
      isEmailVerified: true,
    });

    // 5. Admin User
    const adminUser: any = await User.create({
      name: `Admin User ${testSuffix}`,
      email: `admin_${testSuffix}@example.com`,
      password: "Password123!",
      role: USER_ROLES.ADMIN,
      isEmailVerified: true,
    });

    // 6. Active Job posted by Owner A for Company A
    const activeJobA: any = await Job.create({
      title: `Senior Backend Developer ${testSuffix}`,
      description: "Building resilient microservices",
      company: companyA.name,
      companyId: companyA._id,
      recruiterId: recruiterOwnerA._id,
      postedBy: recruiterOwnerA._id,
      location: "San Francisco, CA",
      salaryMin: 120000,
      salaryMax: 160000,
      currency: "USD",
      salaryPeriod: "yearly",
      workMode: "remote",
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
      status: JOB_STATUS.ACTIVE,
      isDeleted: false,
    });

    // 7. Draft Job posted by Owner A for Company A
    const draftJobA: any = await Job.create({
      title: `Draft Architect ${testSuffix}`,
      description: "Architecture design in progress",
      company: companyA.name,
      companyId: companyA._id,
      recruiterId: recruiterOwnerA._id,
      postedBy: recruiterOwnerA._id,
      location: "San Francisco, CA",
      salaryMin: 180000,
      salaryMax: 220000,
      currency: "USD",
      salaryPeriod: "yearly",
      workMode: "remote",
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
      status: JOB_STATUS.DRAFT,
      isDeleted: false,
    });

    // 8. Closed Job posted by Owner A for Company A
    const closedJobA: any = await Job.create({
      title: `Closed Frontend Lead ${testSuffix}`,
      description: "Position filled",
      company: companyA.name,
      companyId: companyA._id,
      recruiterId: recruiterOwnerA._id,
      postedBy: recruiterOwnerA._id,
      location: "San Francisco, CA",
      salaryMin: 130000,
      salaryMax: 170000,
      currency: "USD",
      salaryPeriod: "yearly",
      workMode: "remote",
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.THREE_TO_FIVE_YEARS,
      status: JOB_STATUS.CLOSED,
      isDeleted: false,
    });

    // 9. Soft-deleted Job posted by Owner A for Company A
    const deletedJobA: any = await Job.create({
      title: `Deleted Devops ${testSuffix}`,
      description: "Deleted role",
      company: companyA.name,
      companyId: companyA._id,
      recruiterId: recruiterOwnerA._id,
      postedBy: recruiterOwnerA._id,
      location: "San Francisco, CA",
      salaryMin: 100000,
      salaryMax: 140000,
      currency: "USD",
      salaryPeriod: "yearly",
      workMode: "remote",
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.ONE_TO_TWO_YEARS,
      status: JOB_STATUS.ACTIVE,
      isDeleted: true,
    });

    // 10. Application for activeJobA by candidateUser
    const applicationResumePublicId = `resumes/app_${testSuffix}`;
    const applicationA: any = await Application.create({
      jobId: activeJobA._id,
      applicantId: candidateUser._id,
      status: APPLICATION_STATUS.APPLIED,
      resumePublicId: applicationResumePublicId,
      resume: applicationResumePublicId,
      isDeleted: false,
    });

    // Application for deletedJobA
    const deletedJobAppResume = `resumes/del_job_app_${testSuffix}`;
    const applicationOnDeletedJob: any = await Application.create({
      jobId: deletedJobA._id,
      applicantId: candidateUser._id,
      status: APPLICATION_STATUS.APPLIED,
      resumePublicId: deletedJobAppResume,
      resume: deletedJobAppResume,
      isDeleted: false,
    });

    // -------------------------------------------------------------------------
    // TEST SECTION 1: P1 RESUME ACCESS (POST /api/uploads/resume-url)
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 1: RESUME ACCESS (P1) ---");

    // 1. Direct Job Owner (Recruiter Owner A) accessing application resume
    try {
      const req: any = {
        user: { userId: recruiterOwnerA._id.toString(), role: USER_ROLES.RECRUITER },
        body: { applicationId: applicationA._id.toString() },
      };
      const res = createMockResponse();
      await getAuthenticatedResumeUrl(req, res);
      assert(res.statusCode === 200 && res.data?.data?.publicId === applicationResumePublicId, "1. Direct job owner can access applicant resume");
    } catch (err: any) {
      assert(false, "1. Direct job owner can access applicant resume", err.message);
    }

    // 2. Authorized Company Teammate (Recruiter Teammate A) accessing application resume for Company A job
    try {
      const req: any = {
        user: { userId: recruiterTeammateA._id.toString(), role: USER_ROLES.RECRUITER },
        body: { applicationId: applicationA._id.toString() },
      };
      const res = createMockResponse();
      await getAuthenticatedResumeUrl(req, res);
      assert(res.statusCode === 200 && res.data?.data?.publicId === applicationResumePublicId, "2. Company teammate can access applicant resume for company job");
    } catch (err: any) {
      assert(false, "2. Company teammate can access applicant resume for company job", err.message);
    }

    // 3. External Recruiter from Company B accessing application resume for Company A job -> 403
    try {
      const req: any = {
        user: { userId: recruiterCompanyB._id.toString(), role: USER_ROLES.RECRUITER },
        body: { applicationId: applicationA._id.toString() },
      };
      const res = createMockResponse();
      await getAuthenticatedResumeUrl(req, res);
      assert(false, "3. External recruiter gets 403 for company A resume", "Expected 403 Forbidden");
    } catch (err: any) {
      assert(err.statusCode === 403, "3. External recruiter gets 403 for company A resume");
    }

    // 4. Unauthorized candidate accessing another candidate's application resume -> 403
    try {
      const req: any = {
        user: { userId: candidateUser2._id.toString(), role: USER_ROLES.CANDIDATE },
        body: { applicationId: applicationA._id.toString() },
      };
      const res = createMockResponse();
      await getAuthenticatedResumeUrl(req, res);
      assert(false, "4. Unauthorized candidate gets 403", "Expected 403 Forbidden");
    } catch (err: any) {
      assert(err.statusCode === 403, "4. Unauthorized candidate gets 403");
    }

    // 5. Candidate accessing their own application resume -> 200
    try {
      const req: any = {
        user: { userId: candidateUser._id.toString(), role: USER_ROLES.CANDIDATE },
        body: { applicationId: applicationA._id.toString() },
      };
      const res = createMockResponse();
      await getAuthenticatedResumeUrl(req, res);
      assert(res.statusCode === 200 && res.data?.data?.publicId === applicationResumePublicId, "5. Candidate can access their own resume");
    } catch (err: any) {
      assert(false, "5. Candidate can access their own resume", err.message);
    }

    // 6. Admin accessing application resume -> 200
    try {
      const req: any = {
        user: { userId: adminUser._id.toString(), role: USER_ROLES.ADMIN },
        body: { applicationId: applicationA._id.toString() },
      };
      const res = createMockResponse();
      await getAuthenticatedResumeUrl(req, res);
      assert(res.statusCode === 200 && res.data?.data?.publicId === applicationResumePublicId, "6. Admin can access any resume");
    } catch (err: any) {
      assert(false, "6. Admin can access any resume", err.message);
    }

    // 7. Soft-deleted job must not grant resume access to recruiter
    try {
      const req: any = {
        user: { userId: recruiterOwnerA._id.toString(), role: USER_ROLES.RECRUITER },
        body: { applicationId: applicationOnDeletedJob._id.toString() },
      };
      const res = createMockResponse();
      await getAuthenticatedResumeUrl(req, res);
      assert(false, "7. Deleted job does not grant resume access to owner", "Expected 403 Forbidden");
    } catch (err: any) {
      assert(err.statusCode === 403, "7. Deleted job does not grant resume access to owner");
    }

    // Teammate accessing deleted job application resume -> 403
    try {
      const req: any = {
        user: { userId: recruiterTeammateA._id.toString(), role: USER_ROLES.RECRUITER },
        body: { applicationId: applicationOnDeletedJob._id.toString() },
      };
      const res = createMockResponse();
      await getAuthenticatedResumeUrl(req, res);
      assert(false, "7b. Deleted job does not grant resume access to teammate", "Expected 403 Forbidden");
    } catch (err: any) {
      assert(err.statusCode === 403, "7b. Deleted job does not grant resume access to teammate");
    }

    // -------------------------------------------------------------------------
    // TEST SECTION 2: P2 DRAFT/CLOSED JOB INSPECTION (GET /api/jobs/:id)
    // -------------------------------------------------------------------------
    console.log("\n--- SECTION 2: DRAFT/CLOSED JOB INSPECTION (P2) ---");

    // 8. Owner can view Draft job
    try {
      const job = await getJobById(draftJobA._id.toString(), {
        userId: recruiterOwnerA._id.toString(),
        role: USER_ROLES.RECRUITER,
      });
      assert(job && job._id.toString() === draftJobA._id.toString(), "8. Owner can view draft job");
    } catch (err: any) {
      assert(false, "8. Owner can view draft job", err.message);
    }

    // 9. Owner can view Closed job
    try {
      const job = await getJobById(closedJobA._id.toString(), {
        userId: recruiterOwnerA._id.toString(),
        role: USER_ROLES.RECRUITER,
      });
      assert(job && job._id.toString() === closedJobA._id.toString(), "9. Owner can view closed job");
    } catch (err: any) {
      assert(false, "9. Owner can view closed job", err.message);
    }

    // 10. Authorized Teammate can view Draft job
    try {
      const job = await getJobById(draftJobA._id.toString(), {
        userId: recruiterTeammateA._id.toString(),
        role: USER_ROLES.RECRUITER,
      });
      assert(job && job._id.toString() === draftJobA._id.toString(), "10. Authorized teammate can view draft job");
    } catch (err: any) {
      assert(false, "10. Authorized teammate can view draft job", err.message);
    }

    // 11. Authorized Teammate can view Closed job
    try {
      const job = await getJobById(closedJobA._id.toString(), {
        userId: recruiterTeammateA._id.toString(),
        role: USER_ROLES.RECRUITER,
      });
      assert(job && job._id.toString() === closedJobA._id.toString(), "11. Authorized teammate can view closed job");
    } catch (err: any) {
      assert(false, "11. Authorized teammate can view closed job", err.message);
    }

    // 12. External Recruiter cannot view Draft job (404)
    try {
      await getJobById(draftJobA._id.toString(), {
        userId: recruiterCompanyB._id.toString(),
        role: USER_ROLES.RECRUITER,
      });
      assert(false, "12. External recruiter cannot view draft job", "Expected 404 Not Found");
    } catch (err: any) {
      assert(err.statusCode === 404, "12. External recruiter cannot view draft job (404)");
    }

    // 13. Candidate cannot view Draft job (404)
    try {
      await getJobById(draftJobA._id.toString(), {
        userId: candidateUser._id.toString(),
        role: USER_ROLES.CANDIDATE,
      });
      assert(false, "13. Candidate cannot view draft job", "Expected 404");
    } catch (err: any) {
      assert(err.statusCode === 404, "13. Candidate cannot view draft job (404)");
    }

    // 14. Public user (no auth) cannot view Draft job (404)
    try {
      await getJobById(draftJobA._id.toString(), undefined);
      assert(false, "14. Public user cannot view draft job", "Expected 404");
    } catch (err: any) {
      assert(err.statusCode === 404, "14. Public user cannot view draft job (404)");
    }

    // 15. Admin can view Draft job
    try {
      const job = await getJobById(draftJobA._id.toString(), {
        userId: adminUser._id.toString(),
        role: USER_ROLES.ADMIN,
      });
      assert(job && job._id.toString() === draftJobA._id.toString(), "15. Admin can view draft job");
    } catch (err: any) {
      assert(false, "15. Admin can view draft job", err.message);
    }

    // 16. Public user CAN view Active job (unchanged public behavior)
    try {
      const job = await getJobById(activeJobA._id.toString(), undefined);
      assert(job && job._id.toString() === activeJobA._id.toString(), "16. Public user can view active job");
    } catch (err: any) {
      assert(false, "16. Public user can view active job", err.message);
    }

    console.log("\n================================================================");
    console.log(` AUDIT SUMMARY: Passed: ${passed} | Failed: ${failed}`);
    console.log("================================================================");
  } finally {
    await mongoose.disconnect();
    console.log(" Disconnected from MongoDB");
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runAuthAuditTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
