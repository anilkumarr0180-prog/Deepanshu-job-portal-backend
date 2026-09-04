import { Router } from "express";
import { submitContactForm } from "../controllers/contact.controller";
import { validate } from "../middleware/validation.middleware";
import { contactMessageSchema } from "../validations/contact.validations";
import { contactRateLimiter } from "../config/rate-limit";

const router = Router();

/**
 * @route   POST /api/contact
 * @desc    Submit a contact inquiry message
 * @access  Public (Rate-limited)
 */
router.post(
  "/",
  contactRateLimiter,
  validate(contactMessageSchema),
  submitContactForm
);

export default router;
