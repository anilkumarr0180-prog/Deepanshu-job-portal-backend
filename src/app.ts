import express from "express";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";

import { generalRateLimiter } from "./config/rate-limit";

import authRoutes from "./routes/auth.routes";
import jobRoutes from "./routes/job.routes";
import applicationRoutes from "./routes/application.routes";
import profileRoutes from "./routes/profile.routes";
import dashboardRoutes from "./routes/dashboard.route";
import adminRoutes from "./routes/admin.routes";
import companyRoutes from "./routes/company.routes";
import savedJobRoutes from "./routes/saved-job.routes";
import notificationRoutes from "./routes/notification.routes";
import chatRoutes from "./routes/chat.routes";
import locationRoutes from "./routes/location.routes";
import subscriptionRoutes from "./routes/subscription.routes";
import uploadRoutes from "./routes/upload.routes";

import { notFoundMiddleware } from "./middleware/not-found.middleware";
import { errorMiddleware } from "./middleware/error.middleware";

const app = express();

/*
|--------------------------------------------------------------------------
| Allowed Origins
|--------------------------------------------------------------------------
| Single source of truth — server.ts reads from this same array for Socket.io.
| Add new origins via the ALLOWED_ORIGINS env var (comma-separated).
|--------------------------------------------------------------------------
*/

export const allowedOrigins = [
  "https://deepanshu-job-portal-frontend-five.vercel.app",
  "http://localhost:5173",
  "http://localhost:5174",
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : []),
];

/*
|--------------------------------------------------------------------------
| Global Middlewares
|--------------------------------------------------------------------------
*/

// Security headers — sets X-Frame-Options, X-XSS-Protection, CSP, etc.
app.use(helmet());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no Origin header)
      // and whitelisted origins.
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

// Cap JSON body size to prevent payload-based memory exhaustion attacks.
app.use(express.json({ limit: "10kb" }));

// Global rate limiter — applies to all routes as a baseline.
// Auth routes apply their own stricter limiter on top of this.
app.use(generalRateLimiter);

/*
|--------------------------------------------------------------------------
| Root Service Metadata & Health Check
|--------------------------------------------------------------------------
| Production best practice.
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| Request Logger
|--------------------------------------------------------------------------
| Development only.
|--------------------------------------------------------------------------
*/

if (process.env.NODE_ENV === "development") {
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.originalUrl}`);
    next();
  });
}

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

app.use("/api/auth", authRoutes);

app.use("/api/jobs", jobRoutes);

app.use("/api", applicationRoutes);

app.use("/api", profileRoutes);

app.use("/api/dashboard", dashboardRoutes);

app.use("/api/admin", adminRoutes);

app.use("/api/company", companyRoutes);

app.use("/api/saved-jobs", savedJobRoutes);

app.use("/api/notifications", notificationRoutes);

app.use("/api/chat", chatRoutes);

app.use("/api/location", locationRoutes);

app.use("/api/subscriptions", subscriptionRoutes);
app.use("/api/v1/subscriptions", subscriptionRoutes);

// Cloudinary upload/signature routes
app.use("/api/uploads", uploadRoutes);

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/

app.use(notFoundMiddleware);

/*
|--------------------------------------------------------------------------
| Global Error Handler
|--------------------------------------------------------------------------
*/

app.use(errorMiddleware);

export default app;