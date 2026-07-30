import { Router } from "express";
import {
  register,
  login,
  getCurrentUser,
} from "../controllers/auth.controller";
import { validate } from "../middleware/validation.middleware";
import {
  registerSchema,
  loginSchema,
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

router.get(
  "/me",
  authMiddleware,
  getCurrentUser
);

export default router;