import { Router } from "express";
import { getAdminDashboard } from "../controllers/admin.controller";

import { authMiddleware } from "../middleware/auth.middleware";
import { authorize } from "../middleware/role.middleware";
import { USER_ROLES } from "../constants/roles";

const router = Router();

// Debug: log when admin routes file is loaded
console.log("admin.routes loaded");
/*
|--------------------------------------------------------------------------
| Admin Dashboard
|--------------------------------------------------------------------------
*/

router.get( "/dashboard",getAdminDashboard);

export default router;