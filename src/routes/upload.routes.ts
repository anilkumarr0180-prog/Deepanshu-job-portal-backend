import { Router } from "express";

import {
  generateUploadSignature,
  getAuthenticatedResumeUrl,
} from "../controllers/upload.controller";

import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";

import {
  uploadSignatureSchema,
  authenticatedResumeUrlSchema,
} from "../validations/upload.validation";

const router = Router();

/*
|--------------------------------------------------------------------------
| Generate Cloudinary Upload Signature
|--------------------------------------------------------------------------
|
| POST /api/uploads/signature
|
| Authentication required.
|
| The client sends only the upload type:
|
| {
|   "type": "profile"
| }
|
| The backend determines the correct Cloudinary preset.
|
|--------------------------------------------------------------------------
*/

router.post(
  "/signature",
  authMiddleware,
  validate(uploadSignatureSchema),
  generateUploadSignature
);

/*
|--------------------------------------------------------------------------
| Generate Authenticated Resume URL
|--------------------------------------------------------------------------
|
| POST /api/uploads/resume-url
|
| Authentication & Role Ownership Authorization Required.
|
|--------------------------------------------------------------------------
*/

router.post(
  "/resume-url",
  authMiddleware,
  validate(authenticatedResumeUrlSchema),
  getAuthenticatedResumeUrl
);

export default router;