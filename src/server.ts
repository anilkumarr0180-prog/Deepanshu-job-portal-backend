import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { execSync } from "child_process";
import app from "./app";
import connectDB from "./config/database";
import { env } from "./config/env";
import { initSocketServer } from "./config/socket";

function freePort(port: string | number) {
  try {
    if (process.platform === "win32") {
      const output = execSync(`netstat -ano | findstr :${port}`).toString();
      const lines = output.split("\n");
      const pidsToKill = new Set<string>();

      for (const line of lines) {
        if (line.includes("LISTENING")) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && pid !== "0" && pid !== String(process.pid)) {
            pidsToKill.add(pid);
          }
        }
      }

      for (const pid of pidsToKill) {
        console.log(`🧹 Freeing port ${port} by terminating PID ${pid}...`);
        try {
          execSync(`taskkill /F /PID ${pid}`);
        } catch {}
      }
    } else {
      execSync(`lsof -t -i:${port} | xargs kill -9 2>/dev/null || true`);
    }
  } catch {
    // Ignore errors if port is not in use or command fails
  }
}

process.on("uncaughtException", (error) => {
  console.error("🔥 Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("🔥 Unhandled Rejection:", reason);
});

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

    const io = initSocketServer(server, allowedOrigins);

    let isRetrying = false;
    server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        if (!isRetrying) {
          isRetrying = true;
          console.warn(`⚠️ Port ${env.PORT} is in use. Automatically releasing port ${env.PORT}...`);
          freePort(env.PORT);
          setTimeout(() => {
            server.close();
            server.listen(env.PORT);
          }, 800);
        }
      } else {
        console.error("Server error:", error);
      }
    });

    server.listen(env.PORT, () => {
      console.log(`🚀 Enterprise Server running on port ${env.PORT}`);
    });

    const gracefulShutdown = (signal: string) => {
      console.log(`Shutting down server gracefully on ${signal}...`);
      if (io) {
        try {
          io.close();
        } catch {}
      }

      if (typeof (server as any).closeAllConnections === "function") {
        (server as any).closeAllConnections();
      }

      server.close(() => {
        console.log(`Server closed on ${signal}.`);
        process.exit(0);
      });

      setTimeout(() => {
        process.exit(0);
      }, 1000).unref();
    };

    process.once("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.once("SIGINT", () => gracefulShutdown("SIGINT"));
    process.once("SIGUSR2", () => gracefulShutdown("SIGUSR2"));
  } catch (error) {
    console.error("Failed to start server:", error);
  }
};

startServer();