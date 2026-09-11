import { Router } from "express";
import {
  generateJobDescription,
  parseResume,
  analyzeMatch,
} from "../controllers/ai.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../validations/validate";
import {
  generateJobDescriptionInputSchema,
  matchAnalysisInputSchema,
} from "../validations/ai.validations";
import { aiRateLimiter } from "../config/rate-limit";

const router = Router();

// Apply AI rate limiter to all AI endpoints
router.use(aiRateLimiter);

// 1. Recruiter: Generate formatted Job Description
router.post(
  "/generate-job-description",
  authMiddleware,
  validate(generateJobDescriptionInputSchema),
  generateJobDescription
);

// 2. Candidate: Parse Resume (PDF URL from Cloudinary or raw text)
router.post(
  "/parse-resume",
  authMiddleware,
  parseResume
);

// 3. Both: Analyze Candidate-Job Fit & Match Score
router.post(
  "/analyze-match",
  authMiddleware,
  validate(matchAnalysisInputSchema),
  analyzeMatch
);

export default router;
