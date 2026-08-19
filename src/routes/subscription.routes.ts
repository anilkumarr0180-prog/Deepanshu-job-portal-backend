import { Router } from "express";
import { validate } from "../validations/validate";
import {
  checkoutSchema,
  createRazorpayOrderSchema,
  verifyRazorpayPaymentSchema,
  createPolarCheckoutSchema,
  verifyPolarPaymentSchema,
  validateCouponSchema,
  boostJobSchema,
} from "../validations/subscription.validations";

import { authMiddleware } from "../middleware/auth.middleware";
import {
  getPlansController,
  getMySubscriptionController,
  checkoutController,
  cancelSubscriptionController,
  reactivateSubscriptionController,
  getTransactionsController,
  webhookController,
  polarWebhookController,
  validateCouponController,
  boostJobController,
  downloadInvoiceController,
  createRazorpayOrderController,
  verifyRazorpayPaymentController,
  createPolarCheckoutController,
  verifyPolarPaymentController,
} from "../controllers/subscription.controller";

const router = Router();

// Public routes
router.get("/plans", getPlansController);
router.post("/webhook", webhookController);
router.post("/polar/webhook", polarWebhookController);
router.post("/validate-coupon", validate(validateCouponSchema), validateCouponController);

// Authenticated user routes
router.get("/me", authMiddleware, getMySubscriptionController);
router.post("/checkout", authMiddleware, validate(checkoutSchema), checkoutController);
router.post("/create-razorpay-order", authMiddleware, validate(createRazorpayOrderSchema), createRazorpayOrderController);
router.post("/verify-razorpay-payment", authMiddleware, validate(verifyRazorpayPaymentSchema), verifyRazorpayPaymentController);
router.post("/create-polar-checkout", authMiddleware, validate(createPolarCheckoutSchema), createPolarCheckoutController);
router.post("/verify-polar-payment", authMiddleware, validate(verifyPolarPaymentSchema), verifyPolarPaymentController);
router.post("/boost-job", authMiddleware, validate(boostJobSchema), boostJobController);
router.get("/invoices/:id/download", authMiddleware, downloadInvoiceController);
router.post("/cancel", authMiddleware, cancelSubscriptionController);
router.post("/reactivate", authMiddleware, reactivateSubscriptionController);
router.get("/transactions", authMiddleware, getTransactionsController);

export default router;