import { Router } from "express";
import { getAdminDashboard } from "../controllers/admin.controller";

import { authMiddleware } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { USER_ROLES } from "../constants/roles";

const router = Router();

/*
|--------------------------------------------------------------------------
| Admin Dashboard
|--------------------------------------------------------------------------
*/

router.get(
  "/dashboard",
  authMiddleware,
  authorize(USER_ROLES.ADMIN),
  getAdminDashboard
);

export default router;