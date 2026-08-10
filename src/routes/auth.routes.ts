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

const router = Router();

router.post(
  "/register",
  validate(registerSchema),
  register
);

router.post(
  "/login",
  validate(loginSchema),
  login
);

router.post(
  "/google",
  validate(googleAuthSchema),
  googleAuth
);

router.get(
  "/me",
  authMiddleware,
  getCurrentUser
);

export default router;