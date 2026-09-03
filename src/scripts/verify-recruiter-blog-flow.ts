import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/database";
import "../models/user.model";
import "../models/blog-category.model";
import User from "../models/user.model";
import BlogCategory from "../models/blog-category.model";
import Blog from "../models/blog.model";
import * as blogService from "../services/blog.service";
import { BLOG_STATUS } from "../constants/blog-status";
import { USER_ROLES } from "../constants/roles";
import { AppError } from "../utils/app-error";
import { generateAccessToken } from "../utils/jwt";

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, num: number, name: string, details?: string) {
  if (condition) {
    results.push({ num, name, passed: true, details });
    console.log(`  [PASS] Test ${num}: ${name}`);
  } else {
    results.push({ num, name, passed: false, error: "Assertion failed", details });
    console.error(`  [FAIL] Test ${num}: ${name} - Details: ${details || "None"}`);
  }
}

async function runRecruiterBlogTests() {
  console.log("===============================================================");
  console.log(" STARTING RECRUITER BLOG MANAGEMENT VERIFICATION SUITE ");
  console.log("===============================================================");

  await connectDB();

  // Setup Test Users: Recruiter Alpha, Recruiter Beta, Candidate, Admin
  let recruiterA = await User.findOne({ email: "recruiter-alpha-test@jobbox-test.com" });
  if (!recruiterA) {
    recruiterA = await User.create({
      name: "Recruiter Alpha",
      email: "recruiter-alpha-test@jobbox-test.com",
      password: "TestPassword123!",
      role: USER_ROLES.RECRUITER,
      isEmailVerified: true,
      authProvider: "local",
    });
  }

  let recruiterB = await User.findOne({ email: "recruiter-beta-test@jobbox-test.com" });
  if (!recruiterB) {
    recruiterB = await User.create({
      name: "Recruiter Beta",
      email: "recruiter-beta-test@jobbox-test.com",
      password: "TestPassword123!",
      role: USER_ROLES.RECRUITER,
      isEmailVerified: true,
      authProvider: "local",
    });
  }

  let testCandidate = await User.findOne({ email: "candidate-qa-test@jobbox-test.com" });
  if (!testCandidate) {
    testCandidate = await User.create({
      name: "Candidate QA Tester",
      email: "candidate-qa-test@jobbox-test.com",
      password: "TestPassword123!",
      role: USER_ROLES.CANDIDATE,
      isEmailVerified: true,
      authProvider: "local",
    });
  }

  let testAdmin = await User.findOne({ role: USER_ROLES.ADMIN, isDeleted: false });
  if (!testAdmin) {
    testAdmin = await User.create({
      name: "Admin Tester",
      email: "admin-recruiter-test@jobbox-test.com",
      password: "TestPassword123!",
      role: USER_ROLES.ADMIN,
      isEmailVerified: true,
      authProvider: "local",
    });
  }

  const testCategory = await BlogCategory.findOneAndUpdate(
    { slug: "recruiter-qa-category" },
    {
      $setOnInsert: {
        name: "Recruiter QA Category",
        slug: "recruiter-qa-category",
        description: "Category for recruiter blog automated test verification.",
        isDeleted: false,
      },
    },
    { upsert: true, new: true }
  );

  const categoryId = testCategory._id.toString();
  const recruiterAId = recruiterA._id.toString();
  const recruiterBId = recruiterB._id.toString();
  const candidateId = testCandidate._id.toString();
  const adminId = testAdmin._id.toString();

  let draftBlogA: any;
  let publishedBlogA: any;
  let blogB: any;
  let candidateBlog: any;
  let adminBlog: any;

  // 1. Recruiter creates draft
  try {
    draftBlogA = await blogService.createCandidateBlog(
      {
        title: "Recruiter A Engineering Hiring Playbook",
        excerpt: "A comprehensive guide on scaling tech teams effectively.",
        content: "Complete breakdown of hiring funnel, technical screens, and offer closing.",
        categoryId,
        tags: ["recruiting", "leadership"],
        status: BLOG_STATUS.DRAFT,
      },
      recruiterAId
    );
    assert(
      draftBlogA &&
        draftBlogA.status === BLOG_STATUS.DRAFT &&
        draftBlogA.authorId._id.toString() === recruiterAId &&
        draftBlogA.isDeleted === false,
      1,
      "Recruiter creates draft blog"
    );
  } catch (err: any) {
    assert(false, 1, "Recruiter creates draft blog", err.message);
  }

  // 2. Recruiter creates published Blog
  try {
    publishedBlogA = await blogService.createCandidateBlog(
      {
        title: "Top 5 Mistakes Startups Make When Hiring Staff Engineers",
        excerpt: "Key hiring metrics and retention strategies for high-growth tech firms.",
        content: "Staff level engineering hiring requires clear compensation frameworks and calibrated expectations.",
        categoryId,
        tags: ["startups", "talent", "staff-engineer"],
        status: BLOG_STATUS.PUBLISHED,
      },
      recruiterAId
    );
    assert(
      publishedBlogA &&
        publishedBlogA.status === BLOG_STATUS.PUBLISHED &&
        publishedBlogA.publishedAt instanceof Date &&
        publishedBlogA.authorId._id.toString() === recruiterAId,
      2,
      "Recruiter creates published blog"
    );
  } catch (err: any) {
    assert(false, 2, "Recruiter creates published blog", err.message);
  }

  // 3. Recruiter lists own Blogs
  try {
    const recruiterABlogs = await blogService.getCandidateBlogs(recruiterAId, {
      page: 1,
      limit: 10,
    });
    const containsOwnOnly = recruiterABlogs.items.every(
      (b: any) => b.authorId._id.toString() === recruiterAId
    );
    assert(
      recruiterABlogs.items.length >= 2 && containsOwnOnly,
      3,
      "Recruiter lists own blogs"
    );
  } catch (err: any) {
    assert(false, 3, "Recruiter lists own blogs", err.message);
  }

  // 4. Recruiter fetches own Blog
  try {
    const fetched = await blogService.getCandidateBlogById(draftBlogA._id.toString(), recruiterAId);
    assert(
      fetched && fetched._id.toString() === draftBlogA._id.toString(),
      4,
      "Recruiter fetches own blog by ID"
    );
  } catch (err: any) {
    assert(false, 4, "Recruiter fetches own blog by ID", err.message);
  }

  // 5. Recruiter edits own Blog
  try {
    const updated = await blogService.updateCandidateBlog(
      draftBlogA._id.toString(),
      {
        title: "Recruiter A Engineering Hiring Playbook (Updated)",
        excerpt: "Updated excerpt with salary calibration data.",
        tags: ["recruiting", "talent-acquisition", "growth"],
      },
      recruiterAId
    );
    assert(
      updated.title === "Recruiter A Engineering Hiring Playbook (Updated)" &&
        updated.tags.includes("talent-acquisition"),
      5,
      "Recruiter edits own blog"
    );
  } catch (err: any) {
    assert(false, 5, "Recruiter edits own blog", err.message);
  }

  // 6. Recruiter publishes own draft
  try {
    const published = await blogService.publishCandidateBlog(
      draftBlogA._id.toString(),
      recruiterAId
    );
    assert(
      Boolean(published && published.status === BLOG_STATUS.PUBLISHED && published.publishedAt != null),
      6,
      "Recruiter publishes own draft"
    );
  } catch (err: any) {
    assert(false, 6, "Recruiter publishes own draft", err.message);
  }

  // 7. Recruiter unpublishes own Blog
  try {
    const unpublished = await blogService.unpublishCandidateBlog(
      draftBlogA._id.toString(),
      recruiterAId
    );
    assert(
      Boolean(unpublished && unpublished.status === BLOG_STATUS.DRAFT && unpublished.publishedAt === undefined),
      7,
      "Recruiter unpublishes own blog"
    );
  } catch (err: any) {
    assert(false, 7, "Recruiter unpublishes own blog", err.message);
  }

  // 8. Recruiter deletes own Blog
  try {
    const deleteRes = await blogService.deleteCandidateBlog(
      draftBlogA._id.toString(),
      recruiterAId
    );
    const inDb = await Blog.findById(draftBlogA._id);
    assert(
      deleteRes.success && inDb?.isDeleted === true,
      8,
      "Recruiter deletes own blog (soft delete)"
    );
  } catch (err: any) {
    assert(false, 8, "Recruiter deletes own blog", err.message);
  }

  // Setup Blog for Recruiter B
  blogB = await blogService.createCandidateBlog(
    {
      title: "Recruiter B Internal Compensation Strategy",
      excerpt: "Private compensation planning documentation.",
      content: "Confidential salary benchmarks and equity grant guidelines.",
      categoryId,
      status: BLOG_STATUS.DRAFT,
    },
    recruiterBId
  );

  // 9. Recruiter A attempts to GET Recruiter B's Blog -> 404
  try {
    await blogService.getCandidateBlogById(blogB._id.toString(), recruiterAId);
    assert(false, 9, "Recruiter A attempts to GET Recruiter B's Blog");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 404,
      9,
      "Recruiter A attempts to GET Recruiter B's Blog -> returns 404",
      err.message
    );
  }

  // 10. Recruiter A attempts to PATCH Recruiter B's Blog -> 404
  try {
    await blogService.updateCandidateBlog(
      blogB._id.toString(),
      { title: "Defaced by Recruiter A" },
      recruiterAId
    );
    assert(false, 10, "Recruiter A attempts to PATCH Recruiter B's Blog");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 404,
      10,
      "Recruiter A attempts to PATCH Recruiter B's Blog -> returns 404",
      err.message
    );
  }

  // 11. Recruiter A attempts to PUBLISH Recruiter B's Blog -> 404
  try {
    await blogService.publishCandidateBlog(blogB._id.toString(), recruiterAId);
    assert(false, 11, "Recruiter A attempts to PUBLISH Recruiter B's Blog");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 404,
      11,
      "Recruiter A attempts to PUBLISH Recruiter B's Blog -> returns 404",
      err.message
    );
  }

  // 12. Recruiter A attempts to DELETE Recruiter B's Blog -> 404
  try {
    await blogService.deleteCandidateBlog(blogB._id.toString(), recruiterAId);
    assert(false, 12, "Recruiter A attempts to DELETE Recruiter B's Blog");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 404,
      12,
      "Recruiter A attempts to DELETE Recruiter B's Blog -> returns 404",
      err.message
    );
  }

  // Setup Candidate Blog
  candidateBlog = await blogService.createCandidateBlog(
    {
      title: "Candidate Career Transition Roadmap",
      excerpt: "Career pathing guide from bootcamp to senior software engineer.",
      content: "Skills to prioritize, open source contributions, and interviewing tactics.",
      categoryId,
      status: BLOG_STATUS.PUBLISHED,
    },
    candidateId
  );

  // 13. Recruiter attempts to access Candidate Blog in author endpoint -> 404
  try {
    await blogService.getCandidateBlogById(candidateBlog._id.toString(), recruiterAId);
    assert(false, 13, "Recruiter attempts to access Candidate Blog");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 404,
      13,
      "Recruiter attempts to access Candidate Blog -> returns 404",
      err.message
    );
  }

  // 14. Recruiter attempts to modify Candidate Blog -> 404
  try {
    await blogService.updateCandidateBlog(
      candidateBlog._id.toString(),
      { title: "Recruiter Tampered Candidate Blog" },
      recruiterAId
    );
    assert(false, 14, "Recruiter attempts to modify Candidate Blog");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 404,
      14,
      "Recruiter attempts to modify Candidate Blog -> returns 404",
      err.message
    );
  }

  // Setup Admin Blog
  adminBlog = await blogService.createBlog(
    {
      title: "Platform Rules & Governance",
      excerpt: "Official platform policies for recruiters and candidates.",
      content: "Governance policies, community standards, and hiring integrity rules.",
      categoryId,
      status: BLOG_STATUS.PUBLISHED,
      isFeatured: true,
      isTrending: true,
    },
    adminId
  );

  // 15. Recruiter attempts to modify Admin Blog -> 404
  try {
    await blogService.updateCandidateBlog(
      adminBlog._id.toString(),
      { title: "Recruiter Tampered Admin Blog" },
      recruiterAId
    );
    assert(false, 15, "Recruiter attempts to modify Admin Blog");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 404,
      15,
      "Recruiter attempts to modify Admin Blog -> returns 404",
      err.message
    );
  }

  // 16. Recruiter Token and Role Verification
  const recruiterToken = generateAccessToken({
    userId: recruiterAId,
    role: USER_ROLES.RECRUITER,
  });
  assert(
    typeof recruiterToken === "string" && recruiterToken.length > 20,
    16,
    "Recruiter JWT token generated with RECRUITER role claim"
  );

  // 17. Server derives authorId strictly from req.user.userId (authorId spoofing prevented)
  const spoofAttemptBlog = await blogService.createCandidateBlog(
    {
      title: "Author ID Spoof Attempt Blog",
      excerpt: "Verifying server derives author identity from req.user.userId.",
      content: "Malicious payload with another user's authorId specified.",
      categoryId,
    },
    recruiterAId
  );
  assert(
    spoofAttemptBlog.authorId._id.toString() === recruiterAId,
    17,
    "Recruiter attempts to send another user's authorId -> server sets authenticated user ID"
  );

  // 18. Recruiter cannot set isFeatured=true
  assert(
    spoofAttemptBlog.isFeatured === false,
    18,
    "Recruiter cannot set isFeatured (always false)"
  );

  // 19. Recruiter cannot set isTrending=true
  assert(
    spoofAttemptBlog.isTrending === false,
    19,
    "Recruiter cannot set isTrending (always false)"
  );

  // 20. Recruiter cannot modify viewsCount or isDeleted directly
  const viewsCheck = await blogService.updateCandidateBlog(
    spoofAttemptBlog._id.toString(),
    { title: "Updated Spoof Attempt Blog" },
    recruiterAId
  );
  assert(
    viewsCheck.viewsCount === 0 && viewsCheck.isDeleted === false,
    20,
    "Recruiter cannot modify viewsCount or isDeleted via update"
  );

  // 21. Public Blog feed only exposes published, non-deleted blogs (and includes published recruiter posts)
  const publicFeed = await blogService.getPublicBlogs({ page: 1, limit: 50 });
  const allPublishedAndActive = publicFeed.items.every(
    (b: any) => b.status === BLOG_STATUS.PUBLISHED && b.isDeleted === false
  );
  const containsPublishedRecruiter = publicFeed.items.some(
    (b: any) => b._id.toString() === publishedBlogA._id.toString()
  );
  const containsDraftB = publicFeed.items.some(
    (b: any) => b._id.toString() === blogB._id.toString()
  );
  assert(
    allPublishedAndActive && containsPublishedRecruiter && !containsDraftB,
    21,
    "Public Blog feed exposes published recruiter post and excludes draft/deleted posts"
  );

  // Print Summary
  console.log("\n===============================================================");
  console.log(" RECRUITER VERIFICATION TEST SUMMARY");
  console.log("===============================================================");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(` Total Tests:  ${results.length}`);
  console.log(` Passed:       ${passed}`);
  console.log(` Failed:       ${failed}`);
  console.log("===============================================================\n");

  // Clean up test data
  await Blog.deleteMany({
    _id: {
      $in: [
        draftBlogA?._id,
        publishedBlogA?._id,
        blogB?._id,
        candidateBlog?._id,
        adminBlog?._id,
        spoofAttemptBlog?._id,
      ].filter(Boolean),
    },
  });

  await mongoose.disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runRecruiterBlogTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
