import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  getPlansController,
  getMySubscriptionController,
  checkoutController,
  cancelSubscriptionController,
  getTransactionsController,
  webhookController,
  validateCouponController,
  boostJobController,
  downloadInvoiceController,
  createRazorpayOrderController,
  verifyRazorpayPaymentController,
} from "../controllers/subscription.controller";

const router = Router();

// Public routes
router.get("/plans", getPlansController);
router.post("/webhook", webhookController);
router.post("/validate-coupon", validateCouponController);

// Authenticated user routes
router.get("/me", authMiddleware, getMySubscriptionController);
router.post("/checkout", authMiddleware, checkoutController);
router.post("/create-razorpay-order", authMiddleware, createRazorpayOrderController);
router.post("/verify-razorpay-payment", authMiddleware, verifyRazorpayPaymentController);
router.post("/boost-job", authMiddleware, boostJobController);
router.get("/invoices/:id/download", authMiddleware, downloadInvoiceController);
router.post("/cancel", authMiddleware, cancelSubscriptionController);
router.get("/transactions", authMiddleware, getTransactionsController);

export default router;
