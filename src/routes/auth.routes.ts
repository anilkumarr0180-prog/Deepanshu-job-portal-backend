import { Router } from "express";
import {
  register,
  login,
  googleAuth,
  getCurrentUser,
} from "../controllers/auth.controller";
import { validate } from "../middleware/validation.middleware";
import {
  registerSchema,
  loginSchema,
  googleAuthSchema,
} from "../validations/auth.validations";
import { authMiddleware } from "../middleware/auth.middleware";
import { authRateLimiter } from "../config/rate-limit";

const router = Router();

router.post(
  "/register",
  authRateLimiter,
  validate(registerSchema),
  register
);

router.post(
  "/login",
  authRateLimiter,
  validate(loginSchema),
  login
);

router.post(
  "/google",
  authRateLimiter,
  validate(googleAuthSchema),
  googleAuth
);

router.get(
  "/me",
  authMiddleware,
  getCurrentUser
);

export default router;