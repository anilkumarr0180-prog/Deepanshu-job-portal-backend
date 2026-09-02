import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import BlogCategory from "../models/blog-category.model";

export const DEFAULT_BLOG_CATEGORIES = [
  {
    name: "News",
    slug: "news",
    description: "Latest company news and platform updates.",
  },
  {
    name: "Events",
    slug: "events",
    description: "Upcoming hiring fairs, webinars, and conferences.",
  },
  {
    name: "Career Advice",
    slug: "career-advice",
    description: "Actionable guides to accelerate your career growth.",
  },
  {
    name: "Interview Tips",
    slug: "interview-tips",
    description: "Prepare and excel at technical and behavioral interviews.",
  },
  {
    name: "Industry Trends",
    slug: "industry-trends",
    description: "Insights into market dynamics, salaries, and future tech.",
  },
];

/**
 * Idempotent database seed for default Blog Categories using findOneAndUpdate upsert.
 * Safe to execute multiple times without duplicating or corrupting existing categories.
 */
export async function seedBlogCategories() {
  console.log("[START] Seeding Blog Categories (Idempotent)...");
  const results = [];

  for (const cat of DEFAULT_BLOG_CATEGORIES) {
    const updated = await BlogCategory.findOneAndUpdate(
      { slug: cat.slug },
      {
        $setOnInsert: {
          name: cat.name,
          slug: cat.slug,
          description: cat.description,
          isDeleted: false,
        },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    results.push(updated);
    console.log(`[SEED] Ensured category: ${cat.name} (${cat.slug})`);
  }

  console.log(`[SUCCESS] Seeded/Verified ${results.length} blog categories.`);
  return results;
}

// Standalone execution entrypoint
if (require.main === module) {
  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI ||
    "mongodb://localhost:27017/job-box";

  mongoose
    .connect(mongoUri)
    .then(async () => {
      await seedBlogCategories();
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error("[ERROR] Failed to seed blog categories:", err);
      process.exit(1);
    });
}
