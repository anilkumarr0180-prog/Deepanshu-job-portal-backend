import { GoogleGenAI } from "@google/genai";
import { env } from "./env";

if (!env.GEMINI_API_KEY) {
  console.warn("⚠️ [AI Config] GEMINI_API_KEY is not defined. AI features will be unavailable.");
}

// Initialize the official Google Gen AI client
export const aiClient = new GoogleGenAI({
  apiKey: env.GEMINI_API_KEY,
});

// Default cost-free, high-speed model
export const AI_MODEL = "gemini-2.5-flash";
