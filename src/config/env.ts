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
} = process.env;

if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is not defined.");
}

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined.");
}

export const env = {
  PORT: PORT || "5000",
  MONGODB_URI,
  JWT_SECRET,
  JWT_EXPIRES_IN: (JWT_EXPIRES_IN || "7d") as StringValue,
  SMTP_HOST: SMTP_HOST || "smtp.gmail.com",
  SMTP_PORT: parseInt(SMTP_PORT || "587", 10),
  SMTP_SECURE: SMTP_SECURE === "true",
  SMTP_USER: (SMTP_USER || EMAIL_USER || "").trim(),
  SMTP_PASS: (SMTP_PASS || EMAIL_PASS || "").replace(/\s+/g, "").trim(),
  SMTP_FROM: (SMTP_FROM || EMAIL_FROM || SMTP_USER || EMAIL_USER || "no-reply@jobsbox.com").trim(),
};