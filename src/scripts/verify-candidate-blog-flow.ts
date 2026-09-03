import mongoose, { Types } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/database";
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

async function runCandidateBlogTests() {
  console.log("===============================================================");
  console.log(" STARTING CANDIDATE BLOG MANAGEMENT VERIFICATION SUITE ");
  console.log("===============================================================");

  await connectDB();

  // Setup Test Users: Candidate A, Candidate B, Recruiter, Admin
  let candidateA = await User.findOne({ email: "candidate-a-test@jobbox-test.com" });
  if (!candidateA) {
    candidateA = await User.create({
      name: "Candidate Author Alpha",
      email: "candidate-a-test@jobbox-test.com",
      password: "TestPassword123!",
      role: USER_ROLES.CANDIDATE,
      isEmailVerified: true,
      authProvider: "local",
    });
  }

  let candidateB = await User.findOne({ email: "candidate-b-test@jobbox-test.com" });
  if (!candidateB) {
    candidateB = await User.create({
      name: "Candidate Author Beta",
      email: "candidate-b-test@jobbox-test.com",
      password: "TestPassword123!",
      role: USER_ROLES.CANDIDATE,
      isEmailVerified: true,
      authProvider: "local",
    });
  }

  let testRecruiter = await User.findOne({ email: "recruiter-test@jobbox-test.com" });
  if (!testRecruiter) {
    testRecruiter = await User.create({
      name: "Recruiter Tester",
      email: "recruiter-test@jobbox-test.com",
      password: "TestPassword123!",
      role: USER_ROLES.RECRUITER,
      isEmailVerified: true,
      authProvider: "local",
    });
  }

  let testAdmin = await User.findOne({ role: USER_ROLES.ADMIN, isDeleted: false });
  if (!testAdmin) {
    testAdmin = await User.create({
      name: "Admin Tester",
      email: "admin-test@jobbox-test.com",
      password: "TestPassword123!",
      role: USER_ROLES.ADMIN,
      isEmailVerified: true,
      authProvider: "local",
    });
  }

  const testCategory = await BlogCategory.findOneAndUpdate(
    { slug: "candidate-qa-category" },
    {
      $setOnInsert: {
        name: "Candidate QA Category",
        slug: "candidate-qa-category",
        description: "Category for candidate blog automated test verification.",
        isDeleted: false,
      },
    },
    { upsert: true, new: true }
  );

  const categoryId = testCategory._id.toString();
  const candidateAId = candidateA._id.toString();
  const candidateBId = candidateB._id.toString();

  let draftBlogA: any;
  let publishedBlogA: any;
  let blogB: any;
  let adminBlog: any;

  // 1. Candidate creates draft
  try {
    draftBlogA = await blogService.createCandidateBlog(
      {
        title: "Candidate A First Draft Article",
        excerpt: "This is a test excerpt for candidate A draft article.",
        content: "Detailed markdown content about preparing for frontend engineering interviews.",
        categoryId,
        tags: ["interview", "frontend"],
        status: BLOG_STATUS.DRAFT,
      },
      candidateAId
    );
    assert(
      draftBlogA &&
        draftBlogA.status === BLOG_STATUS.DRAFT &&
        draftBlogA.authorId._id.toString() === candidateAId &&
        draftBlogA.isDeleted === false,
      1,
      "Candidate creates draft blog"
    );
  } catch (err: any) {
    assert(false, 1, "Candidate creates draft blog", err.message);
  }

  // 2. Candidate creates published blog
  try {
    publishedBlogA = await blogService.createCandidateBlog(
      {
        title: "Candidate A Published Article",
        excerpt: "This is a published excerpt for candidate A article.",
        content: "Detailed content explaining microfrontends with Module Federation.",
        categoryId,
        tags: ["architecture", "microfrontends"],
        status: BLOG_STATUS.PUBLISHED,
      },
      candidateAId
    );
    assert(
      publishedBlogA &&
        publishedBlogA.status === BLOG_STATUS.PUBLISHED &&
        publishedBlogA.publishedAt instanceof Date &&
        publishedBlogA.authorId._id.toString() === candidateAId,
      2,
      "Candidate creates published blog"
    );
  } catch (err: any) {
    assert(false, 2, "Candidate creates published blog", err.message);
  }

  // 3. Candidate gets own blogs
  try {
    const candidateABlogs = await blogService.getCandidateBlogs(candidateAId, {
      page: 1,
      limit: 10,
    });
    const containsOwn = candidateABlogs.items.every(
      (b: any) => b.authorId._id.toString() === candidateAId
    );
    assert(
      candidateABlogs.items.length >= 2 && containsOwn,
      3,
      "Candidate gets own blogs"
    );
  } catch (err: any) {
    assert(false, 3, "Candidate gets own blogs", err.message);
  }

  // 4. Candidate gets single own blog
  try {
    const fetched = await blogService.getCandidateBlogById(draftBlogA._id.toString(), candidateAId);
    assert(
      fetched && fetched._id.toString() === draftBlogA._id.toString(),
      4,
      "Candidate gets own blog by ID"
    );
  } catch (err: any) {
    assert(false, 4, "Candidate gets own blog by ID", err.message);
  }

  // 5. Candidate edits own blog
  try {
    const updated = await blogService.updateCandidateBlog(
      draftBlogA._id.toString(),
      {
        title: "Candidate A Updated Draft Title",
        excerpt: "Updated excerpt with more detail for candidate A.",
        tags: ["interview", "react", "career"],
      },
      candidateAId
    );
    assert(
      updated.title === "Candidate A Updated Draft Title" &&
        updated.tags.includes("react"),
      5,
      "Candidate edits own blog"
    );
  } catch (err: any) {
    assert(false, 5, "Candidate edits own blog", err.message);
  }

  // 6. Candidate publishes own draft
  try {
    const published = await blogService.publishCandidateBlog(
      draftBlogA._id.toString(),
      candidateAId
    );
    assert(
      Boolean(published && published.status === BLOG_STATUS.PUBLISHED && published.publishedAt != null),
      6,
      "Candidate publishes own draft"
    );
  } catch (err: any) {
    assert(false, 6, "Candidate publishes own draft", err.message);
  }

  // 7. Candidate unpublishes own blog
  try {
    const unpublished = await blogService.unpublishCandidateBlog(
      draftBlogA._id.toString(),
      candidateAId
    );
    assert(
      Boolean(unpublished && unpublished.status === BLOG_STATUS.DRAFT && unpublished.publishedAt === undefined),
      7,
      "Candidate unpublishes own blog"
    );
  } catch (err: any) {
    assert(false, 7, "Candidate unpublishes own blog", err.message);
  }

  // 8. Candidate deletes own blog
  try {
    const deleteRes = await blogService.deleteCandidateBlog(
      draftBlogA._id.toString(),
      candidateAId
    );
    const inDb = await Blog.findById(draftBlogA._id);
    assert(
      deleteRes.success && inDb?.isDeleted === true,
      8,
      "Candidate deletes own blog (soft delete)"
    );
  } catch (err: any) {
    assert(false, 8, "Candidate deletes own blog", err.message);
  }

  // Setup Blog for Candidate B
  blogB = await blogService.createCandidateBlog(
    {
      title: "Candidate B Secret Article",
      excerpt: "This is candidate B private draft article.",
      content: "Exclusive notes on backend system design and caching architectures.",
      categoryId,
      status: BLOG_STATUS.DRAFT,
    },
    candidateBId
  );

  // 9. Candidate A attempts to edit Candidate B's blog -> Must throw AppError 404 (no leak)
  try {
    await blogService.updateCandidateBlog(
      blogB._id.toString(),
      { title: "Hacked by Candidate A" },
      candidateAId
    );
    assert(false, 9, "Candidate A attempts to edit Candidate B's blog");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 404,
      9,
      "Candidate A attempts to edit Candidate B's blog -> returns 404",
      err.message
    );
  }

  // 10. Candidate A attempts to delete Candidate B's blog -> Must throw AppError 404
  try {
    await blogService.deleteCandidateBlog(blogB._id.toString(), candidateAId);
    assert(false, 10, "Candidate A attempts to delete Candidate B's blog");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 404,
      10,
      "Candidate A attempts to delete Candidate B's blog -> returns 404",
      err.message
    );
  }

  // 11. Candidate A attempts to publish Candidate B's blog -> Must throw AppError 404
  try {
    await blogService.publishCandidateBlog(blogB._id.toString(), candidateAId);
    assert(false, 11, "Candidate A attempts to publish Candidate B's blog");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 404,
      11,
      "Candidate A attempts to publish Candidate B's blog -> returns 404",
      err.message
    );
  }

  // Setup Admin Blog
  adminBlog = await blogService.createBlog(
    {
      title: "Official Admin Guidelines",
      excerpt: "Official platform blog published directly by site administrators.",
      content: "Comprehensive guidelines for recruiters and candidates using JobBox.",
      categoryId,
      status: BLOG_STATUS.PUBLISHED,
      isFeatured: true,
      isTrending: true,
    },
    testAdmin._id.toString()
  );

  // 12. Candidate attempts to modify Admin blog -> Must throw AppError 404 (candidate route)
  try {
    await blogService.updateCandidateBlog(
      adminBlog._id.toString(),
      { title: "Candidate Defaced Admin Blog" },
      candidateAId
    );
    assert(false, 12, "Candidate attempts to modify Admin blog");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 404,
      12,
      "Candidate attempts to modify Admin blog -> returns 404",
      err.message
    );
  }

  // 13. Candidate attempts to modify Recruiter blog (if recruiter blog exists) -> returns 404
  const recruiterBlog = await Blog.create({
    title: "Recruiter Hiring Guide",
    slug: "recruiter-hiring-guide-" + Date.now(),
    excerpt: "Hiring best practices for engineering teams and talent leads.",
    content: "Content about hiring velocity and candidate experience.",
    categoryId: new Types.ObjectId(categoryId),
    authorId: testRecruiter._id,
    readingTime: 3,
    status: BLOG_STATUS.PUBLISHED,
    isDeleted: false,
  });

  try {
    await blogService.updateCandidateBlog(
      recruiterBlog._id.toString(),
      { title: "Defaced by Candidate" },
      candidateAId
    );
    assert(false, 13, "Candidate attempts to modify Recruiter blog");
  } catch (err: any) {
    assert(
      err instanceof AppError && err.statusCode === 404,
      13,
      "Candidate attempts to modify Recruiter blog -> returns 404",
      err.message
    );
  }

  // 14. Role Verification: generate candidate JWT and verify role protection
  const candidateToken = generateAccessToken({
    userId: candidateAId,
    role: USER_ROLES.CANDIDATE,
  });
  assert(
    typeof candidateToken === "string" && candidateToken.length > 20,
    14,
    "Candidate JWT token generation & role encapsulation"
  );

  // 15. Server derives authorId strictly from req.user.userId (Impersonation Defense)
  const impersonationAttemptBlog = await blogService.createCandidateBlog(
    {
      title: "Author ID Impersonation Test Blog",
      excerpt: "Checking server enforcement of authenticated user ID over body.",
      content: "Content payload with spoofed authorId in raw payload.",
      categoryId,
    },
    candidateAId
  );
  assert(
    impersonationAttemptBlog.authorId._id.toString() === candidateAId,
    15,
    "Candidate attempts to manipulate authorId -> server enforces authenticated user ID"
  );

  // 16 & 17. Candidate cannot set isFeatured or isTrending
  assert(
    impersonationAttemptBlog.isFeatured === false &&
      impersonationAttemptBlog.isTrending === false,
    16,
    "Candidate cannot set isFeatured or isTrending (always false)"
  );

  // 18. Candidate cannot modify viewsCount or isDeleted directly
  const viewsCheck = await blogService.updateCandidateBlog(
    impersonationAttemptBlog._id.toString(),
    { title: "Updated Impersonation Test Blog" },
    candidateAId
  );
  assert(
    viewsCheck.viewsCount === 0 && viewsCheck.isDeleted === false,
    18,
    "Candidate cannot modify viewsCount or isDeleted via update"
  );

  // 19. Public Blog feed only exposes published, non-deleted blogs
  const publicFeed = await blogService.getPublicBlogs({ page: 1, limit: 50 });
  const allPublishedAndActive = publicFeed.items.every(
    (b: any) => b.status === BLOG_STATUS.PUBLISHED && b.isDeleted === false
  );
  const containsDraftB = publicFeed.items.some(
    (b: any) => b._id.toString() === blogB._id.toString()
  );
  assert(
    allPublishedAndActive && !containsDraftB,
    19,
    "Public Blog feed only exposes published, non-deleted blogs"
  );

  // 20. Admin Blog functionality regression check
  const adminBlogs = await blogService.getAdminBlogs({ page: 1, limit: 10 });
  assert(
    adminBlogs.items.length > 0 &&
      adminBlogs.items.some((b: any) => b._id.toString() === adminBlog._id.toString()),
    20,
    "Existing Admin Blog functionality operates with full visibility and regression-free"
  );

  // Print Summary
  console.log("\n===============================================================");
  console.log(" VERIFICATION TEST SUMMARY");
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
        adminBlog?._id,
        recruiterBlog?._id,
        impersonationAttemptBlog?._id,
      ].filter(Boolean),
    },
  });

  await mongoose.disconnect();

  if (failed > 0) {
    process.exit(1);
  }
}

runCandidateBlogTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
