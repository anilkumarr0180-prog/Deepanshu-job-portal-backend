import assert from "assert";
import http from "http";
import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/database";
import app from "../app";
import User from "../models/user.model";
import Job from "../models/job.model";
import Application from "../models/application.model";
import Interview from "../models/interview.model";
import Company from "../models/company.model";
import { USER_ROLES } from "../constants/roles";
import { APPLICATION_STATUS } from "../constants/application-status";
import { INTERVIEW_STATUS, CANDIDATE_RSVP_STATUS } from "../constants/interview-status";
import { EMPLOYMENT_TYPE } from "../constants/employment-type";
import { EXPERIENCE_LEVEL } from "../constants/experience-level";
import { JOB_STATUS } from "../constants/job-status";
import { generateAccessToken } from "../utils/jwt";

interface ApiResponse<T = any> {
  status: number;
  data: T;
}

function makeRequest(
  serverPort: number,
  method: string,
  path: string,
  token?: string,
  body?: any
): Promise<ApiResponse> {
  return new Promise((resolve, reject) => {
    const jsonBody = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: serverPort,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(jsonBody ? { "Content-Length": Buffer.byteLength(jsonBody) } : {}),
        },
      },
      (res) => {
        let rawData = "";
        res.on("data", (chunk) => {
          rawData += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = rawData ? JSON.parse(rawData) : null;
            resolve({ status: res.statusCode || 500, data: parsed });
          } catch {
            resolve({ status: res.statusCode || 500, data: rawData });
          }
        });
      }
    );

    req.on("error", reject);
    if (jsonBody) req.write(jsonBody);
    req.end();
  });
}

async function runInterviewApiTests() {
  console.log("==================================================");
  console.log("🧪 RUNNING INTERVIEW REST API INTEGRATION TESTS");
  console.log("==================================================\n");

  await connectDB();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as any;
  const serverPort = address.port;

  const testSuffix = Date.now().toString().slice(-6);

  // 1. Setup Test Users
  const recruiterA = await User.create({
    name: `Recruiter Alpha ${testSuffix}`,
    email: `recruiter_a_${testSuffix}@example.com`,
    password: "Password123!",
    role: USER_ROLES.RECRUITER,
    isEmailVerified: true,
  });
  const tokenRecruiterA = generateAccessToken({ userId: recruiterA._id.toString(), role: USER_ROLES.RECRUITER });

  const recruiterB = await User.create({
    name: `Recruiter Beta ${testSuffix}`,
    email: `recruiter_b_${testSuffix}@example.com`,
    password: "Password123!",
    role: USER_ROLES.RECRUITER,
    isEmailVerified: true,
  });
  const tokenRecruiterB = generateAccessToken({ userId: recruiterB._id.toString(), role: USER_ROLES.RECRUITER });

  const candidateA = await User.create({
    name: `Candidate Alice ${testSuffix}`,
    email: `candidate_a_${testSuffix}@example.com`,
    password: "Password123!",
    role: USER_ROLES.CANDIDATE,
    isEmailVerified: true,
  });
  const tokenCandidateA = generateAccessToken({ userId: candidateA._id.toString(), role: USER_ROLES.CANDIDATE });

  const candidateB = await User.create({
    name: `Candidate Bob ${testSuffix}`,
    email: `candidate_b_${testSuffix}@example.com`,
    password: "Password123!",
    role: USER_ROLES.CANDIDATE,
    isEmailVerified: true,
  });
  const tokenCandidateB = generateAccessToken({ userId: candidateB._id.toString(), role: USER_ROLES.CANDIDATE });

  const companyA = await Company.create({
    name: `Alpha Innovations ${testSuffix}`,
    description: "Cloud Architecture Company",
    recruiterId: recruiterA._id,
    isVerified: true,
  });

  const jobA = await Job.create({
    title: `Backend Architect ${testSuffix}`,
    description: "Building scalable distributed services",
    company: companyA.name,
    companyId: companyA._id,
    recruiterId: recruiterA._id,
    location: "Bangalore",
    salaryMin: 150000,
    salaryMax: 220000,
    employmentType: EMPLOYMENT_TYPE.FULL_TIME,
    experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
    status: JOB_STATUS.ACTIVE,
  });

  const applicationA = await Application.create({
    jobId: jobA._id,
    applicantId: candidateA._id,
    applicantName: candidateA.name,
    applicantEmail: candidateA.email,
    resume: "https://example.com/alice_resume.pdf",
    status: APPLICATION_STATUS.SHORTLISTED,
  });

  const applicationB = await Application.create({
    jobId: jobA._id,
    applicantId: candidateB._id,
    applicantName: candidateB.name,
    applicantEmail: candidateB.email,
    resume: "https://example.com/bob_resume.pdf",
    status: APPLICATION_STATUS.SHORTLISTED,
  });

  let createdInterviewId = "";
  let secondInterviewId = "";

  try {
    // 1. Recruiter A creates interview for Candidate A application
    console.log("1. Testing POST /api/interviews (Recruiter A schedules for Candidate A)...");
    const createRes = await makeRequest(
      serverPort,
      "POST",
      "/api/interviews",
      tokenRecruiterA,
      {
        applicationId: applicationA._id.toString(),
        title: "Round 1: System Design",
        type: "System Design Round",
        mode: "video",
        scheduledStartTime: new Date(Date.now() + 86400000).toISOString(),
        durationMinutes: 45,
        locationOrLink: "https://meet.google.com/xyz-abc",
        notes: "Prepare whiteboard architecture",
      }
    );
    assert.strictEqual(createRes.status, 201, `Expected 201 Created, got ${createRes.status}`);
    assert.strictEqual(createRes.data.success, true);
    assert.strictEqual(createRes.data.data.status, INTERVIEW_STATUS.SCHEDULED);
    assert.strictEqual(createRes.data.data.roundNumber, 1);
    createdInterviewId = createRes.data.data._id;
    console.log("  ✅ Interview created with 201 Created.");

    // 2. Recruiter B attempts to create for Application A (Unauthorized)
    console.log("2. Testing POST /api/interviews by unauthorized Recruiter B...");
    const unauthCreateRes = await makeRequest(
      serverPort,
      "POST",
      "/api/interviews",
      tokenRecruiterB,
      {
        applicationId: applicationA._id.toString(),
        scheduledStartTime: new Date(Date.now() + 90000000).toISOString(),
      }
    );
    assert.strictEqual(unauthCreateRes.status, 403, `Expected 403 Forbidden, got ${unauthCreateRes.status}`);
    console.log("  ✅ Unauthorized recruiter rejected with 403 Forbidden.");

    // 3. Candidate A views own interview
    console.log("3. Testing GET /api/interviews/:id by Candidate A...");
    const candViewRes = await makeRequest(
      serverPort,
      "GET",
      `/api/interviews/${createdInterviewId}`,
      tokenCandidateA
    );
    assert.strictEqual(candViewRes.status, 200, `Expected 200 OK, got ${candViewRes.status}`);
    assert.strictEqual(candViewRes.data.data._id, createdInterviewId);
    console.log("  ✅ Candidate A retrieved own interview.");

    // 4. Candidate B attempts to view Candidate A's interview (Forbidden)
    console.log("4. Testing GET /api/interviews/:id by unauthorized Candidate B...");
    const candBViewRes = await makeRequest(
      serverPort,
      "GET",
      `/api/interviews/${createdInterviewId}`,
      tokenCandidateB
    );
    assert.strictEqual(candBViewRes.status, 403, `Expected 403 Forbidden, got ${candBViewRes.status}`);
    console.log("  ✅ Unauthorized candidate rejected with 403 Forbidden.");

    // 5. Candidate A accepts interview via PATCH /api/interviews/:id/accept
    console.log("5. Testing PATCH /api/interviews/:id/accept by Candidate A...");
    const acceptRes = await makeRequest(
      serverPort,
      "PATCH",
      `/api/interviews/${createdInterviewId}/accept`,
      tokenCandidateA,
      { note: "Confirmed availability!" }
    );
    assert.strictEqual(acceptRes.status, 200, `Expected 200 OK, got ${acceptRes.status}`);
    assert.strictEqual(acceptRes.data.data.status, INTERVIEW_STATUS.ACCEPTED);
    assert.strictEqual(acceptRes.data.data.candidateResponse.status, CANDIDATE_RSVP_STATUS.ACCEPTED);
    console.log("  ✅ Candidate A accepted interview successfully.");

    // 6. Candidate B accepts and then declines second interview
    console.log("6. Testing candidate decline on second interview...");
    const secondCreateRes = await makeRequest(
      serverPort,
      "POST",
      "/api/interviews",
      tokenRecruiterA,
      {
        applicationId: applicationB._id.toString(),
        title: "Screening Call",
        scheduledStartTime: new Date(Date.now() + 150000000).toISOString(),
        durationMinutes: 30,
      }
    );
    assert.strictEqual(secondCreateRes.status, 201);
    secondInterviewId = secondCreateRes.data.data._id;

    const declineRes = await makeRequest(
      serverPort,
      "PATCH",
      `/api/interviews/${secondInterviewId}/decline`,
      tokenCandidateB,
      { note: "Accepted another offer" }
    );
    assert.strictEqual(declineRes.status, 200);
    assert.strictEqual(declineRes.data.data.status, INTERVIEW_STATUS.DECLINED);
    console.log("  ✅ Candidate B declined interview successfully.");

    // 7. Recruiter A reschedules first interview
    console.log("7. Testing PATCH /api/interviews/:id/reschedule by Recruiter A...");
    const newDate = new Date(Date.now() + 200000000);
    const rescheduleRes = await makeRequest(
      serverPort,
      "PATCH",
      `/api/interviews/${createdInterviewId}/reschedule`,
      tokenRecruiterA,
      {
        scheduledStartTime: newDate.toISOString(),
        durationMinutes: 60,
        reason: "Lead interviewer had a schedule clash",
      }
    );
    assert.strictEqual(rescheduleRes.status, 200);
    assert.strictEqual(rescheduleRes.data.data.status, INTERVIEW_STATUS.RESCHEDULED);
    assert.strictEqual(rescheduleRes.data.data.durationMinutes, 60);
    console.log("  ✅ Recruiter A rescheduled interview successfully.");

    // 8. Recruiter A cancels second interview
    console.log("8. Testing PATCH /api/interviews/:id/cancel by Recruiter A...");
    const cancelRes = await makeRequest(
      serverPort,
      "PATCH",
      `/api/interviews/${secondInterviewId}/cancel`,
      tokenRecruiterA,
      { reason: "Candidate declined, position closing" }
    );
    assert.strictEqual(cancelRes.status, 200);
    assert.strictEqual(cancelRes.data.data.status, INTERVIEW_STATUS.CANCELLED);
    console.log("  ✅ Recruiter A cancelled interview successfully.");

    // 9. Invalid interview ID validation (Invalid ObjectId)
    console.log("9. Testing invalid interview ID (Zod parameter validation)...");
    const invalidIdRes = await makeRequest(
      serverPort,
      "GET",
      "/api/interviews/invalid-id-1234",
      tokenRecruiterA
    );
    assert.strictEqual(invalidIdRes.status, 400, `Expected 400 Bad Request, got ${invalidIdRes.status}`);
    console.log("  ✅ Invalid interview ID rejected with 400 Bad Request.");

    // 10. Invalid application ID validation
    console.log("10. Testing POST with invalid application ID...");
    const invalidAppRes = await makeRequest(
      serverPort,
      "POST",
      "/api/interviews",
      tokenRecruiterA,
      {
        applicationId: "bad-app-id",
        scheduledStartTime: new Date(Date.now() + 86400000).toISOString(),
      }
    );
    assert.strictEqual(invalidAppRes.status, 400);
    console.log("  ✅ Invalid application ID rejected with 400 Bad Request.");

    // 11. Invalid date/time (Past schedule)
    console.log("11. Testing POST with past date/time...");
    const pastDateRes = await makeRequest(
      serverPort,
      "POST",
      "/api/interviews",
      tokenRecruiterA,
      {
        applicationId: applicationA._id.toString(),
        scheduledStartTime: new Date(Date.now() - 3600000 * 24).toISOString(),
      }
    );
    assert.strictEqual(pastDateRes.status, 400);
    console.log("  ✅ Past date/time rejected with 400 Bad Request.");

    // 12. Unauthorized request without JWT
    console.log("12. Testing unauthenticated request (no JWT token)...");
    const unauthReqRes = await makeRequest(
      serverPort,
      "GET",
      "/api/interviews"
    );
    assert.strictEqual(unauthReqRes.status, 401, `Expected 401 Unauthorized, got ${unauthReqRes.status}`);
    console.log("  ✅ Missing JWT rejected with 401 Unauthorized.");

    // 13. Pagination on GET /api/interviews
    console.log("13. Testing GET /api/interviews with pagination...");
    const paginatedRes = await makeRequest(
      serverPort,
      "GET",
      "/api/interviews?page=1&limit=5",
      tokenRecruiterA
    );
    assert.strictEqual(paginatedRes.status, 200);
    assert.strictEqual(paginatedRes.data.pagination.page, 1);
    assert.strictEqual(paginatedRes.data.pagination.limit, 5);
    assert(Array.isArray(paginatedRes.data.data));
    console.log("  ✅ Pagination response structure verified.");

    // 14. Status filtering on GET /api/interviews
    console.log("14. Testing GET /api/interviews?status=rescheduled...");
    const filterRes = await makeRequest(
      serverPort,
      "GET",
      `/api/interviews?status=${INTERVIEW_STATUS.RESCHEDULED}`,
      tokenRecruiterA
    );
    assert.strictEqual(filterRes.status, 200);
    assert(filterRes.data.data.every((i: any) => i.status === INTERVIEW_STATUS.RESCHEDULED));
    console.log("  ✅ Status filtering verified.");

    // 15. Date-Range filtering on GET /api/interviews
    console.log("15. Testing GET /api/interviews with from/to date filters...");
    const dateFilterRes = await makeRequest(
      serverPort,
      "GET",
      `/api/interviews?from=${new Date(Date.now() + 190000000).toISOString()}&to=${new Date(Date.now() + 210000000).toISOString()}`,
      tokenRecruiterA
    );
    assert.strictEqual(dateFilterRes.status, 200);
    assert(dateFilterRes.data.data.length >= 1);
    console.log("  ✅ Date-range filtering verified.");

    // 16. Multi-round application interviews endpoint GET /api/interviews/application/:applicationId
    console.log("16. Testing GET /api/interviews/application/:applicationId...");
    const appInterviewsRes = await makeRequest(
      serverPort,
      "GET",
      `/api/interviews/application/${applicationA._id}`,
      tokenRecruiterA
    );
    assert.strictEqual(appInterviewsRes.status, 200);
    assert(appInterviewsRes.data.data.length >= 1);
    console.log("  ✅ Application interview rounds endpoint verified.");

    console.log("\n==================================================");
    console.log("🎉 ALL 16 REST API INTEGRATION TESTS PASSED!");
    console.log("==================================================");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await Interview.deleteMany({ applicationId: { $in: [applicationA._id, applicationB._id] } });
    await Application.deleteMany({ _id: { $in: [applicationA._id, applicationB._id] } });
    await Job.deleteOne({ _id: jobA._id });
    await Company.deleteOne({ _id: companyA._id });
    await User.deleteMany({ _id: { $in: [recruiterA._id, recruiterB._id, candidateA._id, candidateB._id] } });
  }
}

runInterviewApiTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ REST API Test failed:", err);
    process.exit(1);
  });
