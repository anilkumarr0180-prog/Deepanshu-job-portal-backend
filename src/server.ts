import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app";
import connectDB from "./config/database";
import { env } from "./config/env";
import { initSocketServer } from "./config/socket";

const startServer = async () => {
  try {
    await connectDB();

    const server = http.createServer(app);

    const allowedOrigins = [
      "https://deepanshu-job-portal-frontend-five.vercel.app",
      "http://localhost:5173",
      "http://localhost:5174",
    ];
    if (process.env.ALLOWED_ORIGINS) {
      allowedOrigins.push(
        ...process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
      );
    }

    initSocketServer(server, allowedOrigins);

    server.listen(env.PORT, () => {
      console.log(`🚀 Server & Socket.io engine running on port ${env.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
};

startServer();