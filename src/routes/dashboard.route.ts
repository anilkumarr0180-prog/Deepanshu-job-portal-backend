import { Router } from "express";
import {
  getRecruiterDashboard,
  getCandidateDashboard,
} from "../controllers/dashboard.controller";

import { authMiddleware } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { USER_ROLES } from "../constants/roles";

const router = Router();

/*
|--------------------------------------------------------------------------
| Recruiter Dashboard
|--------------------------------------------------------------------------
*/

router.get(
  "/recruiter",
  authMiddleware,
  authorize(USER_ROLES.RECRUITER),
  getRecruiterDashboard
);

/*
|--------------------------------------------------------------------------
| Candidate Dashboard
|--------------------------------------------------------------------------
*/

router.get(
  "/candidate",
  authMiddleware,
  authorize(USER_ROLES.CANDIDATE),
  getCandidateDashboard
);

export default router;