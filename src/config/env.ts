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
};