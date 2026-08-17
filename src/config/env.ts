import type { StringValue } from "ms";

/*
|--------------------------------------------------------------------------
| Environment Configuration
|--------------------------------------------------------------------------
*/

const {
  PORT,
  MONGODB_URI,
  JWT_SECRET,
  JWT_EXPIRES_IN,

  SMTP_HOST,
  SMTP_PORT,
  SMTP_SECURE,
  SMTP_USER,
  SMTP_PASS,
  EMAIL_USER,
  EMAIL_PASS,
  SMTP_FROM,
  EMAIL_FROM,

  // Cloudinary
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,

  // Razorpay
  RAZORPAY_KEY_ID,
  RAZORPAY_KEY_SECRET,
  RAZORPAY_WEBHOOK_SECRET,
  RAZORPAY_PLAN_RECRUITER_LITE,
  RAZORPAY_PLAN_RECRUITER_ENTERPRISE,
  RAZORPAY_PLAN_CANDIDATE_PRO,
  RAZORPAY_PLAN_CANDIDATE_PREMIUM,
} = process.env;

// ---------------------------------------------------------------------------
// Required environment variables
// ---------------------------------------------------------------------------

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not defined.");
}

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined.");
}

if (!CLOUDINARY_CLOUD_NAME) {
  throw new Error("CLOUDINARY_CLOUD_NAME is not defined.");
}

if (!CLOUDINARY_API_KEY) {
  throw new Error("CLOUDINARY_API_KEY is not defined.");
}

if (!CLOUDINARY_API_SECRET) {
  throw new Error("CLOUDINARY_API_SECRET is not defined.");
}

if (!RAZORPAY_KEY_ID) {
  throw new Error("RAZORPAY_KEY_ID is not defined.");
}

if (!RAZORPAY_KEY_SECRET) {
  throw new Error("RAZORPAY_KEY_SECRET is not defined.");
}

// ---------------------------------------------------------------------------
// Export configuration
// ---------------------------------------------------------------------------

export const env = {
  // Server
  PORT: PORT || "5000",

  // Database
  MONGODB_URI,

  // Authentication
  JWT_SECRET,
  JWT_EXPIRES_IN: (JWT_EXPIRES_IN || "7d") as StringValue,

  // Email
  SMTP_HOST: SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: parseInt(SMTP_PORT || "587", 10),
  SMTP_SECURE: SMTP_SECURE === "true",
  SMTP_USER: (SMTP_USER || EMAIL_USER || "").trim(),
  SMTP_PASS: (SMTP_PASS || EMAIL_PASS || "").replace(/\s+/g, "").trim(),
  SMTP_FROM: (
    SMTP_FROM ||
    EMAIL_FROM ||
    SMTP_USER ||
    EMAIL_USER ||
    "no-reply@jobsbox.com"
  ).trim(),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET,

  // Razorpay
  RAZORPAY_KEY_ID: (RAZORPAY_KEY_ID || "").trim(),
  RAZORPAY_KEY_SECRET: (RAZORPAY_KEY_SECRET || "").trim(),
  RAZORPAY_WEBHOOK_SECRET: (RAZORPAY_WEBHOOK_SECRET || "").trim(),
  RAZORPAY_PLAN_RECRUITER_LITE: (RAZORPAY_PLAN_RECRUITER_LITE || "plan_TPa2Xb7jpp0YDp").trim(),
    RAZORPAY_PLAN_RECRUITER_ENTERPRISE: (RAZORPAY_PLAN_RECRUITER_ENTERPRISE || "plan_TPYTyC7GecJmdC").trim(),
  RAZORPAY_PLAN_CANDIDATE_PRO: (process.env.RAZORPAY_PLAN_CANDIDATE_PRO || "plan_TPc0Up5ZDc7IGE").trim(),
  RAZORPAY_PLAN_CANDIDATE_PREMIUM: (process.env.RAZORPAY_PLAN_CANDIDATE_PREMIUM || "plan_TPc3dSn8XUWR2j").trim(),
};