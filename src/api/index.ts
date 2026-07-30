import dotenv from "dotenv";
dotenv.config();

import app from "../app";
import connectDB from "../config/database";

let isConnected = false;

export default async function handler(req: any, res: any) {
  try {
    const isHealthCheck = req?.url?.startsWith("/health") ?? false;

    if (!isConnected && !isHealthCheck) {
      await connectDB();
      isConnected = true;
    }

    return app(req, res);
  } catch (error) {
    console.error("API handler failed:", error);

    return res.status(503).json({
      success: false,
      message: "Database unavailable. Please try again shortly.",
    });
  }
}