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
| Get Profile (Own or by User ID)
|--------------------------------------------------------------------------
|
| GET /api/profile
| GET /api/profile/:userId
|
|--------------------------------------------------------------------------
*/

router.get(
  "/profile",
  authMiddleware,
  getProfile
);

router.get(
  "/profile/:userId",
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
