import dotenv from "dotenv";
dotenv.config();

import app from "./app";
import connectDB from "./config/database";
import { env } from "./config/env";

const startServer = async () => {
  try {
    await connectDB();

    app.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
  }
};

startServer();