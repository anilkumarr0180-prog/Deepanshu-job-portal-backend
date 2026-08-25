import { Router } from "express";
import { submitReport } from "../controllers/report.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { validate } from "../middleware/validation.middleware";
import { createReportSchema } from "../validations/report.validations";

const router = Router();

router.post("/", authMiddleware, validate(createReportSchema), submitReport);

export default router;
