import { Router } from "express";
import {
  startLocationShare,
  stopLocationShare,
  getLocationShareStatus,
  getCandidateLocation,
  reverseGeocode,
  detectIpLocation,
} from "../controllers/location.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { validate } from "../middleware/validation.middleware";
import {
  startLocationShareSchema,
  stopLocationShareSchema,
  getApplicationLocationSchema,
} from "../validations/location.validations";
import { USER_ROLES } from "../constants/roles";

const router = Router();

/*
|--------------------------------------------------------------------------
| Candidate: Start Location Sharing
|--------------------------------------------------------------------------
*/
router.post(
  "/share/start",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE),
  validate(startLocationShareSchema),
  startLocationShare
);

/*
|--------------------------------------------------------------------------
| Candidate: Stop Location Sharing
|--------------------------------------------------------------------------
*/
router.post(
  "/share/stop",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE),
  validate(stopLocationShareSchema),
  stopLocationShare
);

/*
|--------------------------------------------------------------------------
| Get Sharing Status for Application
|--------------------------------------------------------------------------
*/
router.get(
  "/share/status/:applicationId",
  authMiddleware,
  validate(getApplicationLocationSchema),
  getLocationShareStatus
);

/*
|--------------------------------------------------------------------------
| Recruiter: Get Candidate Location for Application
|--------------------------------------------------------------------------
*/
router.get(
  "/application/:applicationId",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER),
  validate(getApplicationLocationSchema),
  getCandidateLocation
);

/*
|--------------------------------------------------------------------------
| Reverse Geocode via Server Proxy
|--------------------------------------------------------------------------
*/
router.post("/reverse-geocode", reverseGeocode);

/*
|--------------------------------------------------------------------------
| Zero-Click IP Location Detection
|--------------------------------------------------------------------------
*/
router.get("/ip-detect", detectIpLocation);

export default router;
