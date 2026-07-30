import { Router } from "express";

import {
  getProfile,
  updateProfile,
} from "../controllers/profile.controller";

import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";

import { updateProfileSchema } from "../validations/profile.validations";

const router = Router();

/*
|--------------------------------------------------------------------------
| Get Profile
|--------------------------------------------------------------------------
|
| GET /api/profile
|
|--------------------------------------------------------------------------
*/

router.get(
  "/profile",
  authMiddleware,
  getProfile
);

/*
|--------------------------------------------------------------------------
| Update Profile
|--------------------------------------------------------------------------
|
| PATCH /api/profile
|
|--------------------------------------------------------------------------
*/

router.patch(
  "/profile",
  authMiddleware,
  validate(updateProfileSchema),
  updateProfile
);

export default router;