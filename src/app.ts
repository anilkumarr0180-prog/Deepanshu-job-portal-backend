import express from "express";
import cors from "cors";
 
import authRoutes from "./routes/auth.routes";
import jobRoutes from "./routes/job.routes";
import applicationRoutes from "./routes/application.routes";
import profileRoutes from "./routes/profile.routes";
import dashboardRoutes from "./routes/dashboard.route";
import adminRoutes from "./routes/admin.routes";
 
import { notFoundMiddleware } from "./middleware/not-found.middleware";
import { errorMiddleware } from "./middleware/error.middleware";
 
 
const app = express();
 
const allowedOrigins = [
  "https://deepanshu-job-portal-frontend-five.vercel.app",
  "http://localhost:5174",
  "http://localhost:5173",
];
 
app.use(
  cors({
    origin: (origin, callback) => {
      // allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
 
      const customOrigins = process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
        : [];
 
      const allAllowed = [...allowedOrigins, ...customOrigins];
 
      if (allAllowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
 
app.use(express.json());
 
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "Health route working",
  });
});
 
app.use((req, res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});
/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/
 
app.use("/api/auth", authRoutes);
 
app.use("/api/jobs", jobRoutes);
 
app.use("/api", applicationRoutes);
 
app.use("/api", profileRoutes);
 
/*
|--------------------------------------------------------------------------
| Dashboard Routes
|--------------------------------------------------------------------------
*/
 
app.use("/api/dashboard", dashboardRoutes);
 
/*
|--------------------------------------------------------------------------
| Admin Routes
|--------------------------------------------------------------------------
*/
 
// Quick test route to verify admin mount
app.get("/api/admin/test", (req, res) => {
  res.json({ success: true, message: "admin mount ok" });
});
 
// Diagnostic: list all registered routes and methods
app.get("/api/routes", (req, res) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const routes: any[] = [];
 
  // app._router.stack contains layers; some layers are routers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack = (app as any)._router.stack;
 
  stack.forEach((layer: any) => {
    if (layer.route && layer.route.path) {
      const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
      routes.push({ path: layer.route.path, methods });
    } else if (layer.name === "router" && layer.handle && layer.handle.stack) {
      layer.handle.stack.forEach((handler: any) => {
        if (handler.route) {
          const methods = Object.keys(handler.route.methods).map((m) => m.toUpperCase());
          // prefix is layer.regexp or layer.regexp.fast_slash? Use layer.regexp to approximate
          const prefix = layer.regexp && layer.regexp.source ? layer.regexp.source : undefined;
          routes.push({ path: handler.route.path, methods, prefix });
        }
      });
    }
  });
 
  res.json({ success: true, routes });
});
 
app.use("/api/admin", adminRoutes);
 
 
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