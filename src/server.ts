import dotenv from "dotenv";
dotenv.config();

import http from "http";
import { execSync } from "child_process";
import app, { allowedOrigins } from "./app";
import connectDB from "./config/database";
import { env } from "./config/env";
import { initSocketServer } from "./config/socket";
import { initChatNotificationsJob } from "./jobs/chat-notifications.job";
import { initSubscriptionExpirationJob } from "./jobs/subscription-expiration.job";

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
        console.log(` Freeing port ${port} by terminating PID ${pid}...`);
        try {
          execSync(`taskkill /F /PID ${pid}`);
        } catch { }
      }
    } else {
      execSync(`lsof -t -i:${port} | xargs kill -9 2>/dev/null || true`);
    }
  } catch {
    // Ignore errors if port is not in use or command fails
  }
}

process.on("uncaughtException", (error) => {
  // After an uncaughtException the Node process is in an undefined state.
  // Log it and exit immediately so the process manager can restart cleanly.
  console.error(" Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  // Same rationale — don't silently continue after an unhandled promise rejection.
  console.error(" Unhandled Rejection:", reason);
  process.exit(1);
});

const startServer = async () => {
  try {
    await connectDB();

    const server = http.createServer(app);

    // allowedOrigins is imported from app.ts — single source of truth.
    // Both HTTP CORS and Socket.io use the exact same list.
    const io = initSocketServer(server, allowedOrigins);

    // Initialize background jobs
    initChatNotificationsJob();
    initSubscriptionExpirationJob();

    let isRetrying = false;
    server.on("error", (error: any) => {
      if (error.code === "EADDRINUSE") {
        if (!isRetrying) {
          isRetrying = true;
          console.warn(`⚠️ Port ${env.PORT} is in use.`);
          
          if (process.env.NODE_ENV !== "production") {
            console.log(`Automatically releasing port ${env.PORT}...`);
            freePort(env.PORT);
            setTimeout(() => {
              server.close();
              server.listen(env.PORT);
            }, 800);
          } else {
            console.error("In production, EADDRINUSE should crash the process to allow the container orchestrator to restart it.");
            process.exit(1);
          }
        }
      } else {
        console.error("Server error:", error);
      }
    });

    server.listen(env.PORT, () => {
      console.log(` Enterprise Server running on port ${env.PORT}`);
    });

    const gracefulShutdown = (signal: string) => {
      console.log(`Shutting down server gracefully on ${signal}...`);
      if (io) {
        try {
          io.close();
        } catch { }
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
    // Fatal startup failure (e.g. DB unreachable). Exit so the process manager
    // knows to restart — don't silently run with no server listening.
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();