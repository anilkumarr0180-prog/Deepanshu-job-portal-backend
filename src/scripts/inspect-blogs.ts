import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/database";
import "../models/user.model";
import "../models/blog-category.model";
import Blog from "../models/blog.model";

async function inspectDbBlogs() {
  await connectDB();
  const allBlogs = await Blog.find({}).populate("authorId", "name email role").lean();
  console.log("=========================================");
  console.log(`TOTAL BLOGS IN DATABASE: ${allBlogs.length}`);
  console.log("=========================================");
  allBlogs.forEach((b: any, i: number) => {
    console.log(`[#${i + 1}] Title: "${b.title}"`);
    console.log(`     Status: ${b.status} | isDeleted: ${b.isDeleted}`);
    console.log(`     isFeatured: ${b.isFeatured} | isTrending: ${b.isTrending}`);
    console.log(`     Author: ${b.authorId?.name || "null"} (${b.authorId?.role || "null"}) - ${b.authorId?.email || "null"}`);
    console.log(`     Slug: ${b.slug}`);
    console.log(`     CreatedAt: ${b.createdAt}`);
    console.log("-----------------------------------------");
  });
  process.exit(0);
}

inspectDbBlogs().catch((err) => {
  console.error(err);
  process.exit(1);
});
