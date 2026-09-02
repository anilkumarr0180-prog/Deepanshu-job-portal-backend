import dotenv from "dotenv";
dotenv.config();

import connectDB from "../config/database";
import User from "../models/user.model";
import { USER_ROLES } from "../constants/roles";
import cloudinaryService from "../services/cloudinary.service";
import { CLOUDINARY_FOLDERS } from "../constants/cloudinary";

async function verifyUploadSignature() {
  console.log("=== VERIFYING BLOG CLOUDINARY UPLOAD SIGNATURE ===");

  await connectDB();

  // Test 1: Cloudinary Service folder resolution
  const folder = CLOUDINARY_FOLDERS["blog"];
  console.log(`[TEST 1] Cloudinary folder for 'blog': ${folder}`);
  if (folder !== "Job-portal/blogs") {
    throw new Error(`Expected folder Job-portal/blogs but got ${folder}`);
  }

  // Test 2: Signature generation
  const sig = cloudinaryService.generateUploadSignature("blog");
  console.log(`[TEST 2] Generated signature:`, {
    folder: sig.folder,
    cloudName: sig.cloudName,
    apiKey: sig.apiKey ? "Present" : "Missing",
    timestamp: sig.timestamp,
    signatureLength: sig.signature.length,
  });

  if (!sig.signature || !sig.cloudName || !sig.apiKey || sig.folder !== "Job-portal/blogs") {
    throw new Error("Signature generation output incomplete or invalid!");
  }

  console.log("\n[SUCCESS] Blog Cloudinary signature generation is verified and functional.");
  process.exit(0);
}

verifyUploadSignature().catch((err) => {
  console.error("[FAIL]", err);
  process.exit(1);
});
