import { Request, Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import {
  getSubscriptionPlans,
  getUserSubscriptionDetails,
  processCheckoutSession,
  cancelUserSubscription,
  getUserTransactionsHistory,
  validateCouponCode,
  boostJobToFeatured,
} from "../services/subscription.service";
import { generateInvoiceDetails, generateInvoiceHTML } from "../services/invoice.service";

export async function getPlansController(req: Request, res: Response): Promise<void> {
  try {
    const role = req.query.role as "candidate" | "recruiter" | undefined;
    const plans = await getSubscriptionPlans(role);
    res.status(200).json({
      success: true,
      data: plans,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to retrieve subscription plans",
    });
  }
}

export async function getMySubscriptionController(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const subscriptionData = await getUserSubscriptionDetails(userId);
    res.status(200).json({
      success: true,
      data: subscriptionData,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch user subscription details",
    });
  }
}

export async function checkoutController(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { planCode, paymentMethod, couponCode } = req.body;
    if (!planCode) {
      res.status(400).json({ success: false, message: "planCode is required" });
      return;
    }

    const result = await processCheckoutSession(userId, planCode, paymentMethod, couponCode);

    res.status(200).json({
      success: true,
      message: "Subscription payment processed successfully!",
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Checkout session failed",
    });
  }
}

export async function createRazorpayOrderController(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { planCode, couponCode } = req.body;
    if (!planCode) {
      res.status(400).json({ success: false, message: "planCode is required" });
      return;
    }

    const orderData = await (await import("../services/subscription.service")).createRazorpayOrderService(userId, planCode, couponCode);
    res.status(200).json({
      success: true,
      data: orderData,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to create Razorpay order",
    });
  }
}

export async function verifyRazorpayPaymentController(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { orderId, paymentId, signature, planCode, couponCode } = req.body;
    const result = await (await import("../services/subscription.service")).verifyRazorpayPaymentService(
      userId,
      orderId,
      paymentId,
      signature,
      planCode,
      couponCode
    );

    res.status(200).json({
      success: true,
      message: "Razorpay payment verified & subscription activated!",
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Payment verification failed",
    });
  }
}

export async function validateCouponController(req: Request, res: Response): Promise<void> {
  try {
    const { code } = req.body;
    if (!code) {
      res.status(400).json({ success: false, message: "Promo coupon code is required" });
      return;
    }

    const coupon = await validateCouponCode(code);
    res.status(200).json({
      success: true,
      message: `Promo code ${coupon.code} applied! (${coupon.discountValue}${coupon.discountType === "percentage" ? "%" : "$"} OFF)`,
      data: coupon,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Invalid promo coupon code",
    });
  }
}

export async function boostJobController(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { jobId } = req.body;
    if (!jobId) {
      res.status(400).json({ success: false, message: "jobId is required" });
      return;
    }

    const boostedJob = await boostJobToFeatured(userId, jobId);
    res.status(200).json({
      success: true,
      message: "Job successfully boosted to Featured!",
      data: boostedJob,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to boost job",
    });
  }
}

export async function downloadInvoiceController(req: AuthRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id as string;
    const invoiceDetails = await generateInvoiceDetails(id);
    const html = generateInvoiceHTML(invoiceDetails);

    res.setHeader("Content-Type", "text/html");
    res.status(200).send(html);
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message || "Invoice download error" });
  }
}

export async function cancelSubscriptionController(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const canceledSub = await cancelUserSubscription(userId);
    res.status(200).json({
      success: true,
      message: "Subscription set to cancel at end of current billing period.",
      data: canceledSub,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      message: error.message || "Failed to cancel subscription",
    });
  }
}

export async function getTransactionsController(req: AuthRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.userId || req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const transactions = await getUserTransactionsHistory(userId);
    res.status(200).json({
      success: true,
      data: transactions,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch transaction history",
    });
  }
}

export async function webhookController(req: Request, res: Response): Promise<void> {
  try {
    const event = req.body;
    console.log("Received payment gateway webhook event:", event?.type || "unknown");
    res.status(200).json({ received: true });
  } catch (error: any) {
    res.status(400).json({ success: false, message: "Webhook handler error" });
  }
}
