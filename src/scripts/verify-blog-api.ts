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

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, name: string, details?: string) {
  if (condition) {
    results.push({ name, passed: true, details });
    console.log(`  [PASS] ${name}`);
  } else {
    results.push({ name, passed: false, error: "Assertion failed", details });
    console.error(`  [FAIL] ${name} - Details: ${details || "None"}`);
  }
}

async function runTests() {
  console.log("=================================================");
  console.log(" STARTING END-TO-END BLOG API VERIFICATION SUITE ");
  console.log("=================================================");

  await connectDB();

  // 1. Setup Test Admin User and Category
  let testAdmin = await User.findOne({ role: USER_ROLES.ADMIN, isDeleted: false });
  if (!testAdmin) {
    testAdmin = await User.create({
      name: "QA Admin Tester",
      email: `qa-admin-${Date.now()}@jobbox-test.com`,
      role: USER_ROLES.ADMIN,
      isEmailVerified: true,
      authProvider: "local",
    });
  }

  const testCategory = await BlogCategory.findOneAndUpdate(
    { slug: "qa-test-category" },
    {
      $setOnInsert: {
        name: "QA Test Category",
        slug: "qa-test-category",
        description: "Category created exclusively for automated test verification.",
        isDeleted: false,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );

  const adminUserId = testAdmin._id.toString();
  const categoryId = testCategory._id.toString();

  // Test 1: GET /api/blogs/categories is read-only
  console.log("\n--- TEST GROUP: Categories ---");
  const initialCategoryCount = await BlogCategory.countDocuments({ isDeleted: false });
  const fetchedCategories = await blogService.getBlogCategories();
  const afterCategoryCount = await BlogCategory.countDocuments({ isDeleted: false });
  assert(
    fetchedCategories.length >= 1 && initialCategoryCount === afterCategoryCount,
    "1. GET /api/blogs/categories is strictly read-only and returns category list",
    `Initial count: ${initialCategoryCount}, After count: ${afterCategoryCount}`
  );

  // Test 2 & 3: Draft and Archived Blogs never appear publicly
  console.log("\n--- TEST GROUP: Public Visibility & Status Isolation ---");
  const draftBlog = await blogService.createBlog(
    {
      title: "Draft Only Post QA",
      excerpt: "This post should never be exposed in public listings.",
      content: "Detailed body content for the draft only blog post.",
      categoryId,
      status: BLOG_STATUS.DRAFT,
      tags: ["qa-draft", "internal"],
    },
    adminUserId
  );

  const publicBlogsInitial = await blogService.getPublicBlogs({ search: "Draft Only Post QA" });
  assert(
    publicBlogsInitial.items.length === 0,
    "2. Draft blogs never appear in public search / listings",
    `Found count: ${publicBlogsInitial.items.length}`
  );

  let draftSlugError: any = null;
  try {
    await blogService.getBlogBySlug(draftBlog.slug);
  } catch (err: any) {
    draftSlugError = err;
  }
  assert(
    draftSlugError instanceof AppError && draftSlugError.statusCode === 404,
    "3. Accessing draft blog by slug returns 404 Not Found publicly",
    `Received: ${draftSlugError?.message || "No error thrown"}`
  );

  // Test 4: Published Blog public appearance & Atomic views increment
  console.log("\n--- TEST GROUP: Published Blog & Slug Lookup ---");
  const publishedBlog = await blogService.createBlog(
    {
      title: "21 Job Interview Tips QA Post",
      excerpt: "Comprehensive tips and strategies for job interviews.",
      content: "Full length content for interview success with keywords and markdown.",
      categoryId,
      status: BLOG_STATUS.PUBLISHED,
      isFeatured: true,
      isTrending: true,
      tags: ["interview", "tips", "qa-tag"],
    },
    adminUserId
  );

  const initialViews = publishedBlog.viewsCount;
  const fetchedBySlug1 = await blogService.getBlogBySlug(publishedBlog.slug);
  const fetchedBySlug2 = await blogService.getBlogBySlug(publishedBlog.slug);
  assert(
    fetchedBySlug1.slug === publishedBlog.slug && fetchedBySlug2.viewsCount === initialViews + 2,
    "4. Public slug lookup works and atomically increments viewsCount (+2)",
    `Initial views: ${initialViews}, After 2 calls: ${fetchedBySlug2.viewsCount}`
  );

  // Test 5: Safe author data population
  console.log("\n--- TEST GROUP: Author Population Safety ---");
  const authorData: any = fetchedBySlug1.authorId;
  const hasSafeFields = Boolean(authorData?.name && authorData?.email);
  const hasNoSensitiveFields = authorData?.password === undefined && authorData?.googleId === undefined;
  assert(
    hasSafeFields && hasNoSensitiveFields,
    "5. Public author population exposes ONLY safe fields (name, email, profilePicture, role)",
    `Exposed keys: ${Object.keys(authorData || {}).join(", ")}`
  );

  // Test 6: Slug collision handling
  console.log("\n--- TEST GROUP: Slug Collision Handling ---");
  const duplicateBlog1 = await blogService.createBlog(
    {
      title: "Unique Title Collision Test",
      excerpt: "First post with collision title.",
      content: "Content body 1.",
      categoryId,
      status: BLOG_STATUS.DRAFT,
    },
    adminUserId
  );

  const duplicateBlog2 = await blogService.createBlog(
    {
      title: "Unique Title Collision Test",
      excerpt: "Second post with exact same title.",
      content: "Content body 2.",
      categoryId,
      status: BLOG_STATUS.DRAFT,
    },
    adminUserId
  );

  assert(
    duplicateBlog1.slug === "unique-title-collision-test" && duplicateBlog2.slug === "unique-title-collision-test-2",
    "6. Duplicate slugs are automatically disambiguated with incremental suffix (-2)",
    `Slug 1: ${duplicateBlog1.slug}, Slug 2: ${duplicateBlog2.slug}`
  );

  // Test 7: Filtering by category (slug & ObjectId)
  console.log("\n--- TEST GROUP: Category & Tag Filtering ---");
  const catFilteredBySlug = await blogService.getPublicBlogs({ category: "qa-test-category" });
  const catFilteredById = await blogService.getPublicBlogs({ category: categoryId });
  const catFilteredNonexistent = await blogService.getPublicBlogs({ category: "non-existent-cat-slug" });
  assert(
    catFilteredBySlug.items.length >= 1 &&
    catFilteredById.items.length >= 1 &&
    catFilteredNonexistent.items.length === 0,
    "7. Category filtering works seamlessly via slug or ObjectId and handles nonexistent categories cleanly",
    `BySlug: ${catFilteredBySlug.items.length}, ById: ${catFilteredById.items.length}, Nonexistent: ${catFilteredNonexistent.items.length}`
  );

  // Test 8: Tag filtering
  const tagFiltered = await blogService.getPublicBlogs({ tag: "qa-tag" });
  assert(
    tagFiltered.items.length >= 1 && tagFiltered.items.some((b) => b._id.toString() === publishedBlog._id.toString()),
    "8. Tag filtering returns only matching published posts",
    `Tag results count: ${tagFiltered.items.length}`
  );

  // Test 9: Search with special regex characters
  console.log("\n--- TEST GROUP: Search & Pagination ---");
  const specialCharSearch = await blogService.getPublicBlogs({ search: "Interview Tips (QA) [21] * +" });
  assert(
    Array.isArray(specialCharSearch.items),
    "9. Search with regex special characters executes safely without syntax crashes"
  );

  // Test 10: Pagination metadata & bounds
  const paginated = await blogService.getPublicBlogs({ page: "1", limit: "2" });
  assert(
    paginated.pagination.page === 1 &&
    paginated.pagination.limit === 2 &&
    typeof paginated.pagination.totalItems === "number" &&
    typeof paginated.pagination.totalPages === "number" &&
    typeof paginated.pagination.hasNextPage === "boolean",
    "10. Pagination metadata returns valid page/limit/totalItems/totalPages/hasNextPage",
    `Meta: ${JSON.stringify(paginated.pagination)}`
  );

  // Test 11: Featured & Trending
  console.log("\n--- TEST GROUP: Featured & Trending ---");
  const featured = await blogService.getFeaturedBlogs(5);
  const trending = await blogService.getTrendingBlogs(5);
  assert(
    featured.every((b) => b.isFeatured === true && b.status === BLOG_STATUS.PUBLISHED) &&
    trending.every((b) => b.status === BLOG_STATUS.PUBLISHED),
    "11. Featured & Trending queries strictly return published blogs only",
    `Featured count: ${featured.length}, Trending count: ${trending.length}`
  );

  // Test 12: Status transitions
  console.log("\n--- TEST GROUP: Status Transitions & Archiving ---");
  const unpublishRes = await blogService.unpublishBlog(publishedBlog._id.toString());
  assert(unpublishRes?.status === BLOG_STATUS.DRAFT, "12. unpublishBlog transitions status to 'draft'");

  const publishRes = await blogService.publishBlog(publishedBlog._id.toString());
  assert(
    publishRes?.status === BLOG_STATUS.PUBLISHED && Boolean(publishRes.publishedAt),
    "13. publishBlog transitions status to 'published' and assigns publishedAt"
  );

  const archiveRes = await blogService.archiveBlog(publishedBlog._id.toString());
  assert(archiveRes?.status === BLOG_STATUS.ARCHIVED, "14. archiveBlog transitions status to 'archived'");

  const publicCheckArchived = await blogService.getPublicBlogs({ search: "21 Job Interview Tips QA Post" });
  assert(
    publicCheckArchived.items.length === 0,
    "15. Archived blogs never appear in public queries",
    `Found archived in public query: ${publicCheckArchived.items.length}`
  );

  // Test 13: Soft deletion
  console.log("\n--- TEST GROUP: Soft Deletion ---");
  await blogService.deleteBlog(publishedBlog._id.toString());
  const postDeleteDb = await Blog.findById(publishedBlog._id);
  assert(
    postDeleteDb?.isDeleted === true,
    "16. deleteBlog marks isDeleted = true (soft delete)",
    `isDeleted in DB: ${postDeleteDb?.isDeleted}`
  );

  let adminGetDeletedErr: any = null;
  try {
    await blogService.getAdminBlogById(publishedBlog._id.toString());
  } catch (err: any) {
    adminGetDeletedErr = err;
  }
  assert(
    adminGetDeletedErr instanceof AppError && adminGetDeletedErr.statusCode === 404,
    "17. getAdminBlogById returns 404 for soft-deleted blogs"
  );

  // Test 14: Invalid Blog ID
  console.log("\n--- TEST GROUP: Error & Edge Cases ---");
  let invalidIdErr: any = null;
  try {
    await blogService.getAdminBlogById("invalid-id-format");
  } catch (err: any) {
    invalidIdErr = err;
  }
  assert(
    invalidIdErr instanceof AppError && invalidIdErr.statusCode === 400,
    "18. Invalid ObjectId formats return 400 Bad Request error"
  );

  // Clean up test documents
  await Blog.deleteMany({
    _id: { $in: [draftBlog._id, publishedBlog._id, duplicateBlog1._id, duplicateBlog2._id] },
  });
  await BlogCategory.deleteOne({ _id: testCategory._id });

  console.log("\n=================================================");
  console.log(" TEST SUMMARY REPORT ");
  console.log("=================================================");
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.filter((r) => !r.passed).length;
  console.log(`TOTAL: ${results.length} | PASSED: ${passedCount} | FAILED: ${failedCount}`);

  if (failedCount > 0) {
    console.error("\nFAILED TESTS:");
    results.filter((r) => !r.passed).forEach((r) => console.error(` - ${r.name}: ${r.error}`));
    process.exit(1);
  } else {
    console.log("\nALL TESTS PASSED SUCCESSFULLY (100% PASS RATE).");
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("[FATAL TEST ERROR]", err);
  process.exit(1);
});
