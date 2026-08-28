import { Router } from "express";
import { getIceServersController } from "../controllers/call.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// Protect all calling API endpoints with JWT Authentication
router.use(authMiddleware);

/*
|--------------------------------------------------------------------------
| Calling REST Routes
|--------------------------------------------------------------------------
*/

router.get("/ice-servers", getIceServersController);

export default router;
