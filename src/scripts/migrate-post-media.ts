import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import cloudinary from "../config/cloudnary";
import Post from "../models/post.model";
import { CLOUDINARY_FOLDERS } from "../constants/cloudinary";

const LEGACY_CLOUDINARY_POST_FOLDER = "jobportal/posts";

interface MigrationSummary {
  dryRun: boolean;
  totalLegacyFound: number;
  successfullyMigrated: number;
  skippedAlreadyMigrated: number;
  skippedCloudinary404: number;
  failedMigrations: number;
  errors: Array<{
    postId: string;
    oldPublicId: string;
    newPublicId: string;
    error: string;
  }>;
}

export async function runPostMediaMigration(options?: {
  dryRun?: boolean;
  batchSize?: number;
  limit?: number;
}): Promise<MigrationSummary> {
  const isDryRun =
    options?.dryRun !== undefined
      ? options.dryRun
      : process.argv.includes("--dry-run");

  const batchSize = options?.batchSize || 50;
  const limit = options?.limit || 0;

  const summary: MigrationSummary = {
    dryRun: isDryRun,
    totalLegacyFound: 0,
    successfullyMigrated: 0,
    skippedAlreadyMigrated: 0,
    skippedCloudinary404: 0,
    failedMigrations: 0,
    errors: [],
  };

  const mongoUri =
    process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal";
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  console.log("==================================================");
  console.log(
    isDryRun
      ? " CLOUDINARY POST MEDIA MIGRATION (DRY-RUN MODE)"
      : " CLOUDINARY POST MEDIA MIGRATION (EXECUTE MODE)"
  );
  console.log("==================================================");
  console.log(`Source Folder (Legacy) : ${LEGACY_CLOUDINARY_POST_FOLDER}`);
  console.log(`Target Folder (Canonical): ${CLOUDINARY_FOLDERS.post}`);
  console.log(`Batch Size             : ${batchSize}`);
  console.log(`Dry Run Active         : ${isDryRun ? "YES (NO WRITES)" : "NO (LIVE MIGRATION)"}\n`);

  const legacyQuery = {
    $or: [
      { mediaPublicId: { $regex: `^${LEGACY_CLOUDINARY_POST_FOLDER}/` } },
      { mediaUrl: { $regex: `/${LEGACY_CLOUDINARY_POST_FOLDER}/` } },
    ],
  };

  const totalMatching = await Post.countDocuments(legacyQuery);
  summary.totalLegacyFound = totalMatching;
  console.log(`Found ${totalMatching} legacy post media records in MongoDB.`);

  if (totalMatching === 0) {
    console.log("No legacy post media records found. Nothing to migrate.");
    return summary;
  }

  let queryBuilder = Post.find(legacyQuery).batchSize(batchSize);
  if (limit > 0) {
    queryBuilder = queryBuilder.limit(limit);
  }

  const cursor = queryBuilder.cursor();

  let processedCount = 0;

  for await (const post of cursor) {
    processedCount++;
    const postId = post._id.toString();
    const oldPublicId = post.mediaPublicId ? post.mediaPublicId.trim() : "";
    const oldMediaUrl = post.mediaUrl ? post.mediaUrl.trim() : "";

    if (!oldPublicId) {
      console.warn(`[Skip] Post ${postId} missing mediaPublicId.`);
      continue;
    }

    // Compute canonical destination paths
    const newPublicId = oldPublicId.replace(
      new RegExp(`^${LEGACY_CLOUDINARY_POST_FOLDER}/`),
      `${CLOUDINARY_FOLDERS.post}/`
    );

    const newMediaUrl = oldMediaUrl.replace(
      `/${LEGACY_CLOUDINARY_POST_FOLDER}/`,
      `/${CLOUDINARY_FOLDERS.post}/`
    );

    console.log(`\n[${processedCount}/${totalMatching}] Evaluating Post ${postId}:`);
    console.log(`  OLD PublicId: ${oldPublicId}`);
    console.log(`  NEW PublicId: ${newPublicId}`);

    // Step 1: Verify source asset existence in Cloudinary
    let oldAssetExists = false;
    try {
      await cloudinary.api.resource(oldPublicId, { resource_type: "image" });
      oldAssetExists = true;
    } catch (err: any) {
      if (err?.error?.http_code === 404 || err?.http_code === 404) {
        oldAssetExists = false;
      } else {
        console.warn(`  [Cloudinary Warning] Checking old asset: ${err?.message || err}`);
      }
    }

    // Step 2: Check if destination already exists (idempotency check)
    let newAssetExists = false;
    try {
      await cloudinary.api.resource(newPublicId, { resource_type: "image" });
      newAssetExists = true;
    } catch (err: any) {
      if (err?.error?.http_code === 404 || err?.http_code === 404) {
        newAssetExists = false;
      }
    }

    if (!oldAssetExists && !newAssetExists) {
      console.warn(`  [Warning] Asset '${oldPublicId}' not found in Cloudinary (404). Skipping rename.`);
      summary.skippedCloudinary404++;
      continue;
    }

    // DRY RUN MODE
    if (isDryRun) {
      console.log(`  [DRY-RUN] Would rename: '${oldPublicId}' -> '${newPublicId}'`);
      console.log(`  [DRY-RUN] Would update MongoDB: mediaPublicId & mediaUrl`);
      console.log(`  [DRY-RUN] Status: READY (Old Exists: ${oldAssetExists}, New Exists: ${newAssetExists})`);
      summary.successfullyMigrated++;
      continue;
    }

    // EXECUTION MODE
    try {
      // Step A: Rename in Cloudinary if old asset exists and new doesn't yet
      if (oldAssetExists && !newAssetExists) {
        console.log(`  [Cloudinary] Renaming asset '${oldPublicId}' -> '${newPublicId}'...`);
        await cloudinary.uploader.rename(oldPublicId, newPublicId, {
          resource_type: "image",
          invalidate: true,
          overwrite: false,
        });
      } else if (newAssetExists) {
        console.log(`  [Cloudinary] Destination '${newPublicId}' already present. Re-using.`);
      }

      // Step B: Atomic MongoDB Update
      console.log(`  [MongoDB] Updating post document ${postId}...`);
      await Post.updateOne(
        { _id: post._id },
        {
          $set: {
            mediaPublicId: newPublicId,
            mediaUrl: newMediaUrl,
          },
        }
      );

      // Step C: Verify new asset is live
      await cloudinary.api.resource(newPublicId, { resource_type: "image" });

      console.log(`  [Success] Post ${postId} migrated to canonical folder.`);
      summary.successfullyMigrated++;
    } catch (migErr: any) {
      console.error(`  [FAILED] Error migrating post ${postId}:`, migErr);
      summary.failedMigrations++;
      summary.errors.push({
        postId,
        oldPublicId,
        newPublicId,
        error: migErr?.message || String(migErr),
      });
      // Asset is NEVER deleted on failure; state remains retryable
    }
  }

  // Summary Report
  console.log("\n==================================================");
  console.log(" MIGRATION SUMMARY REPORT");
  console.log("==================================================");
  console.log(`Mode                   : ${isDryRun ? "DRY RUN (0 changes)" : "LIVE EXECUTE"}`);
  console.log(`Total Legacy Records   : ${summary.totalLegacyFound}`);
  console.log(`Successfully Processed : ${summary.successfullyMigrated}`);
  console.log(`Skipped (Cloudinary 404): ${summary.skippedCloudinary404}`);
  console.log(`Failed Migrations      : ${summary.failedMigrations}`);
  console.log("==================================================");

  return summary;
}

if (require.main === module) {
  runPostMediaMigration()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("[Migration Script Fatal Error]", err);
      await mongoose.disconnect();
      process.exit(1);
    });
}
