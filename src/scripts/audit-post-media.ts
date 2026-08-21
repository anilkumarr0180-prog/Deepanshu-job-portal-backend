import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import cloudinary from "../config/cloudnary";
import Post from "../models/post.model";
import { CLOUDINARY_FOLDERS } from "../constants/cloudinary";

const LEGACY_CLOUDINARY_POST_FOLDER = "jobportal/posts";

interface AuditSummary {
  totalScannedPosts: number;
  totalMediaPosts: number;
  canonicalMediaPosts: number;
  legacyMediaPosts: number;
  missingMediaPublicId: number;
  missingMediaUrl: number;
  urlPublicIdMismatch: number;
  unverifiedCloudinaryAssets: number;
  verifiedCloudinaryAssets: number;
  invalidMediaReferences: number;
  details: Array<{
    postId: string;
    status: "CANONICAL" | "LEGACY" | "INVALID" | "MISSING_FIELDS" | "MISMATCH";
    mediaPublicId?: string;
    mediaUrl?: string;
    cloudinaryVerified: boolean;
    reason?: string;
  }>;
}

export async function runPostMediaAudit(): Promise<AuditSummary> {
  const summary: AuditSummary = {
    totalScannedPosts: 0,
    totalMediaPosts: 0,
    canonicalMediaPosts: 0,
    legacyMediaPosts: 0,
    missingMediaPublicId: 0,
    missingMediaUrl: 0,
    urlPublicIdMismatch: 0,
    unverifiedCloudinaryAssets: 0,
    verifiedCloudinaryAssets: 0,
    invalidMediaReferences: 0,
    details: [],
  };

  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal";
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(mongoUri);
  }

  console.log("==================================================");
  console.log(" CLOUDINARY POST MEDIA AUDIT (NON-DESTRUCTIVE)");
  console.log("==================================================");
  console.log(`Canonical Folder Target : ${CLOUDINARY_FOLDERS.post}`);
  console.log(`Legacy Folder Namespace : ${LEGACY_CLOUDINARY_POST_FOLDER}`);
  console.log("Scanning MongoDB Post collection...\n");

  const cursor = Post.find({
    $or: [
      { mediaUrl: { $exists: true, $ne: "" } },
      { mediaPublicId: { $exists: true, $ne: "" } },
    ],
  }).cursor();

  for await (const post of cursor) {
    summary.totalScannedPosts++;
    const url = post.mediaUrl ? post.mediaUrl.trim() : "";
    const publicId = post.mediaPublicId ? post.mediaPublicId.trim() : "";

    if (!url && !publicId) continue;
    summary.totalMediaPosts++;

    // Field completeness check
    if (url && !publicId) {
      summary.missingMediaPublicId++;
      summary.details.push({
        postId: post._id.toString(),
        status: "MISSING_FIELDS",
        mediaUrl: url,
        cloudinaryVerified: false,
        reason: "Has mediaUrl but missing mediaPublicId.",
      });
      continue;
    }

    if (!url && publicId) {
      summary.missingMediaUrl++;
      summary.details.push({
        postId: post._id.toString(),
        status: "MISSING_FIELDS",
        mediaPublicId: publicId,
        cloudinaryVerified: false,
        reason: "Has mediaPublicId but missing mediaUrl.",
      });
      continue;
    }

    // URL / publicId consistency check
    const idWithoutExt = publicId.replace(/\.[^/.]+$/, "");
    if (!url.includes(idWithoutExt)) {
      summary.urlPublicIdMismatch++;
      summary.details.push({
        postId: post._id.toString(),
        status: "MISMATCH",
        mediaPublicId: publicId,
        mediaUrl: url,
        cloudinaryVerified: false,
        reason: "mediaUrl and mediaPublicId do not reference the same asset.",
      });
      continue;
    }

    // Verify Cloudinary asset existence
    let isCloudinaryVerified = false;
    try {
      await cloudinary.api.resource(publicId, { resource_type: "image" });
      isCloudinaryVerified = true;
      summary.verifiedCloudinaryAssets++;
    } catch (err: any) {
      if (err?.error?.http_code === 404 || err?.http_code === 404) {
        summary.unverifiedCloudinaryAssets++;
      } else {
        // Network or rate limit warning, treat with caution
        console.warn(`[Cloudinary Warning] Could not verify asset '${publicId}':`, err?.message || err);
      }
    }

    // Namespace classification
    const isCanonical =
      publicId.startsWith(`${CLOUDINARY_FOLDERS.post}/`) &&
      url.includes(`/${CLOUDINARY_FOLDERS.post}/`);

    const isLegacy =
      publicId.startsWith(`${LEGACY_CLOUDINARY_POST_FOLDER}/`) ||
      url.includes(`/${LEGACY_CLOUDINARY_POST_FOLDER}/`);

    if (isCanonical) {
      summary.canonicalMediaPosts++;
      summary.details.push({
        postId: post._id.toString(),
        status: "CANONICAL",
        mediaPublicId: publicId,
        mediaUrl: url,
        cloudinaryVerified: isCloudinaryVerified,
      });
    } else if (isLegacy) {
      summary.legacyMediaPosts++;
      summary.details.push({
        postId: post._id.toString(),
        status: "LEGACY",
        mediaPublicId: publicId,
        mediaUrl: url,
        cloudinaryVerified: isCloudinaryVerified,
      });
    } else {
      summary.invalidMediaReferences++;
      summary.details.push({
        postId: post._id.toString(),
        status: "INVALID",
        mediaPublicId: publicId,
        mediaUrl: url,
        cloudinaryVerified: isCloudinaryVerified,
        reason: `Public ID outside recognized namespaces: '${publicId}'`,
      });
    }
  }

  // Print formatted report
  console.log("--------------------------------------------------");
  console.log(" AUDIT REPORT SUMMARY");
  console.log("--------------------------------------------------");
  console.log(`Total Media Posts Scanned      : ${summary.totalMediaPosts}`);
  console.log(`Canonical Media Assets         : ${summary.canonicalMediaPosts} (${CLOUDINARY_FOLDERS.post})`);
  console.log(`Legacy Media Assets            : ${summary.legacyMediaPosts} (${LEGACY_CLOUDINARY_POST_FOLDER})`);
  console.log(`Verified in Cloudinary         : ${summary.verifiedCloudinaryAssets}`);
  console.log(`Unverified / 404 in Cloudinary : ${summary.unverifiedCloudinaryAssets}`);
  console.log(`Missing mediaPublicId          : ${summary.missingMediaPublicId}`);
  console.log(`Missing mediaUrl               : ${summary.missingMediaUrl}`);
  console.log(`URL / PublicId Mismatches      : ${summary.urlPublicIdMismatch}`);
  console.log(`Invalid Namespace References   : ${summary.invalidMediaReferences}`);
  console.log("--------------------------------------------------");

  if (summary.details.length > 0) {
    console.log("\nAsset Breakdown Details:");
    summary.details.forEach((d, i) => {
      console.log(
        ` [${i + 1}] Post ${d.postId} | ${d.status} | Verified: ${d.cloudinaryVerified ? "YES" : "NO"}` +
          (d.mediaPublicId ? ` | ID: ${d.mediaPublicId}` : "") +
          (d.reason ? ` | Note: ${d.reason}` : "")
      );
    });
  }

  console.log("\nAudit finished successfully (0 modifications performed).\n");
  return summary;
}

if (require.main === module) {
  runPostMediaAudit()
    .then(async () => {
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error("[Audit Error]", err);
      await mongoose.disconnect();
      process.exit(1);
    });
}
