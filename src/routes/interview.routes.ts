import { Router } from "express";
import {
  createInterviewController,
  getInterviewByIdController,
  listInterviewsController,
  getApplicationInterviewsController,
  rescheduleInterviewController,
  candidateRsvpController,
  cancelInterviewController,
  completeInterviewController,
} from "../controllers/interview.controller";

import { authMiddleware } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { validate } from "../middleware/validation.middleware";

import {
  createInterviewSchema,
  rescheduleInterviewSchema,
  candidateRsvpSchema,
  submitFeedbackSchema,
  cancelInterviewSchema,
  getInterviewsQuerySchema,
  interviewIdParamSchema,
  applicationIdParamSchema,
} from "../validations/interview.validations";

import { USER_ROLES } from "../constants/roles";

const router = Router();

// Enforce JWT authentication across all interview endpoints
router.use(authMiddleware);

/*
|--------------------------------------------------------------------------
| 1. Create / Schedule Interview
|--------------------------------------------------------------------------
| POST /api/interviews
*/
router.post(
  "/",
  authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN),
  validate(createInterviewSchema),
  createInterviewController
);

/*
|--------------------------------------------------------------------------
| 2. List Interviews (Filtered & Paginated)
|--------------------------------------------------------------------------
| GET /api/interviews
*/
router.get(
  "/",
  validate(getInterviewsQuerySchema),
  listInterviewsController
);

/*
|--------------------------------------------------------------------------
| 3. Get Multi-Round Interviews for an Application
|--------------------------------------------------------------------------
| GET /api/interviews/application/:applicationId
*/
router.get(
  "/application/:applicationId",
  validate(applicationIdParamSchema),
  getApplicationInterviewsController
);

/*
|--------------------------------------------------------------------------
| 4. Get Interview By ID
|--------------------------------------------------------------------------
| GET /api/interviews/:interviewId
*/
router.get(
  "/:interviewId",
  validate(interviewIdParamSchema),
  getInterviewByIdController
);

/*
|--------------------------------------------------------------------------
| 5. Reschedule Interview
|--------------------------------------------------------------------------
| PATCH /api/interviews/:interviewId/reschedule
*/
router.patch(
  "/:interviewId/reschedule",
  authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN),
  validate(rescheduleInterviewSchema),
  rescheduleInterviewController
);

/*
|--------------------------------------------------------------------------
| 6. Candidate RSVP Actions (Accept / Decline / Request Reschedule)
|--------------------------------------------------------------------------
| PATCH /api/interviews/:interviewId/rsvp
| PATCH /api/interviews/:interviewId/accept
| PATCH /api/interviews/:interviewId/decline
*/
router.patch(
  "/:interviewId/rsvp",
  authorize(USER_ROLES.CANDIDATE),
  validate(candidateRsvpSchema),
  candidateRsvpController
);

router.patch(
  "/:interviewId/accept",
  authorize(USER_ROLES.CANDIDATE),
  validate(candidateRsvpSchema),
  candidateRsvpController
);

router.patch(
  "/:interviewId/decline",
  authorize(USER_ROLES.CANDIDATE),
  validate(candidateRsvpSchema),
  candidateRsvpController
);

/*
|--------------------------------------------------------------------------
| 7. Cancel Interview
|--------------------------------------------------------------------------
| PATCH /api/interviews/:interviewId/cancel
*/
router.patch(
  "/:interviewId/cancel",
  validate(cancelInterviewSchema),
  cancelInterviewController
);

/*
|--------------------------------------------------------------------------
| 8. Complete Interview & Submit Evaluation
|--------------------------------------------------------------------------
| PATCH /api/interviews/:interviewId/complete
*/
router.patch(
  "/:interviewId/complete",
  authorize(USER_ROLES.RECRUITER, USER_ROLES.ADMIN),
  validate(submitFeedbackSchema),
  completeInterviewController
);

export default router;
