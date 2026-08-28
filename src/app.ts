import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";

import { generalRateLimiter } from "./config/rate-limit";

import authRoutes from "./routes/auth.routes";
import jobRoutes from "./routes/job.routes";
import postRoutes from "./routes/post.routes";
import connectionRoutes from "./routes/connection.routes";
import applicationRoutes from "./routes/application.routes";
import profileRoutes from "./routes/profile.routes";
import dashboardRoutes from "./routes/dashboard.route";
import adminRoutes from "./routes/admin.routes";
import companyRoutes from "./routes/company.routes";
import savedJobRoutes from "./routes/saved-job.routes";
import savedPostRoutes from "./routes/saved-post.routes";
import reportRoutes from "./routes/report.routes";
import notificationRoutes from "./routes/notification.routes";
import chatRoutes from "./routes/chat.routes";
import callRoutes from "./routes/call.routes";
import locationRoutes from "./routes/location.routes";
import subscriptionRoutes from "./routes/subscription.routes";
import uploadRoutes from "./routes/upload.routes";

import { notFoundMiddleware } from "./middleware/not-found.middleware";
import { errorMiddleware } from "./middleware/error.middleware";

const app = express();

// Trust reverse proxy headers (Render, Vercel, Cloudflare) for accurate rate-limiting and client IP resolution
app.set("trust proxy", 1);

export const allowedOrigins = [
  "https://deepanshu-job-portal-frontend-five.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : []),
];

app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(
  express.json({
    limit: "10kb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.use(generalRateLimiter);

app.get("/", (_req, res) => {
  res.status(200).json({
    success: true,
    service: "Jobs Box API",
    version: "1.0.0",
    status: "UP",
    documentation: "/api",
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (_req, res) => {
  const isDbConnected = mongoose.connection.readyState === 1;
  const statusCode = isDbConnected ? 200 : 503;

  res.status(statusCode).json({
    success: isDbConnected,
    status: isDbConnected ? "UP" : "DEGRADED",
    database: isDbConnected ? "connected" : "disconnected",
    timestamp: new Date().toISOString(),
  });
});

if (process.env.NODE_ENV === "development") {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
  });
}

app.use("/api/auth", authRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/connections", connectionRoutes);
app.use("/api", applicationRoutes);
app.use("/api", profileRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/saved-jobs", savedJobRoutes);
app.use("/api/saved-posts", savedPostRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/call", callRoutes);
app.use("/api/location", locationRoutes);
app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/v1/subscriptions", subscriptionRoutes);
app.use("/api/uploads", uploadRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;