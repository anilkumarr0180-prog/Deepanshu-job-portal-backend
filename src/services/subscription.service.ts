import { createNotification } from "./notification.service";
import { NOTIFICATION_TYPES } from "../constants/notification-type";
import { sendSubscriptionReceiptEmail } from "./email.service";
import Types from "mongoose";
import crypto from "crypto";
import SubscriptionPlan, { ISubscriptionPlan } from "../models/subscription-plan.model";
import Subscription, { ISubscription } from "../models/subscription.model";
import PaymentTransaction from "../models/payment-transaction.model";
import WebhookEvent from "../models/webhook-event.model";
import User from "../models/user.model";
import Job from "../models/job.model";
import Coupon from "../models/coupon.model";
import { JOB_STATUS } from "../constants/job-status";
import { env } from "../config/env";
import {
  getRazorpayCredentials,
  createRazorpayOrder,
  createRazorpaySubscription,
  createRazorpayPlan,
  verifyPaymentSignature,
  verifyWebhookSignature,
  cancelRazorpaySubscription,
} from "./razorpay.service";

/**
 * Enterprise Subscription Service
 * Production-grade Razorpay Recurring Subscription & Webhook Processing Engine.
 */

export const DEFAULT_PLANS = [
  {
    code: "candidate_free",
    name: "Candidate Standard",
    description: "Essential job search and application tools for career growth.",
    targetRole: "candidate",
    price: 0,
    currency: "INR",
    billingPeriod: "monthly",
    provider: "internal",
    features: {
      jobLimit: -1,
      savedJobsLimit: 5,
      topApplicantBadge: false,
      inmailCredits: 0,
      prioritySupport: false,
      analyticsLevel: "basic",
    },
    isActive: true,
    isPopular: false,
  },
  {
    code: "candidate_pro",
    name: "Career Pro",
    description: "Level up your job search with InMail credits, advanced analytics & unlimited saved jobs.",
    targetRole: "candidate",
    price: 99,
    currency: "INR",
    billingPeriod: "monthly",
    provider: "razorpay",
    providerPlanId: env.RAZORPAY_PLAN_CANDIDATE_PRO,
    features: {
      jobLimit: -1,
      savedJobsLimit: -1,
      topApplicantBadge: false,
      inmailCredits: 3,
      prioritySupport: false,
      analyticsLevel: "advanced",
    },
    isActive: true,
    isPopular: false,
  },
  {
    code: "candidate_premium",
    name: "Career Premium",
    description: "Stand out to recruiters with Top Applicant badge, priority application listing, & InMail credits.",
    targetRole: "candidate",
    price: 299,
    currency: "INR",
    billingPeriod: "monthly",
    provider: "razorpay",
    providerPlanId: env.RAZORPAY_PLAN_CANDIDATE_PREMIUM,
    features: {
      jobLimit: -1,
      savedJobsLimit: -1,
      topApplicantBadge: true,
      inmailCredits: 5,
      prioritySupport: true,
      analyticsLevel: "advanced",
    },
    isActive: true,
    isPopular: true,
  },
  {
    code: "recruiter_free",
    name: "Starter Employer",
    description: "Free plan to test job postings with basic candidate submissions.",
    targetRole: "recruiter",
    price: 0,
    currency: "INR",
    billingPeriod: "monthly",
    provider: "internal",
    features: {
      jobLimit: 1,
      featuredJobLimit: 0,
      inmailCredits: 0,
      candidateSearchAccess: false,
      analyticsLevel: "basic",
    },
    isActive: true,
    isPopular: false,
  },
  {
    code: "recruiter_lite",
    name: "Recruiter Lite",
    description: "Ideal for growing teams posting multiple active jobs and boosting top hires.",
    targetRole: "recruiter",
    price: 999,
    currency: "INR",
    billingPeriod: "monthly",
    provider: "razorpay",
    providerPlanId: env.RAZORPAY_PLAN_RECRUITER_LITE,
    features: {
      jobLimit: 5,
      featuredJobLimit: 2,
      inmailCredits: 30,
      candidateSearchAccess: true,
      analyticsLevel: "advanced",
    },
    isActive: true,
    isPopular: true,
  },
  {
    code: "recruiter_enterprise",
    name: "Recruiter Enterprise",
    description: "Unlimited hiring scale with 10 Featured Job slots, unlimited candidate search & priority support.",
    targetRole: "recruiter",
    price: 8999,
    currency: "INR",
    billingPeriod: "monthly",
    provider: "razorpay",
    providerPlanId: env.RAZORPAY_PLAN_RECRUITER_ENTERPRISE, features: {
      jobLimit: -1,
      featuredJobLimit: 10,
      inmailCredits: -1,
      candidateSearchAccess: true,
      analyticsLevel: "enterprise",
      prioritySupport: true,
    },
    isActive: true,
    isPopular: false,
  },
  {
    code: "candidate_pro_yearly",
    name: "Career Pro (Annual)",
    description: "Level up your job search with InMail credits, advanced analytics & unlimited saved jobs for 1 full year.",
    targetRole: "candidate",
    price: 950,
    currency: "INR",
    billingPeriod: "yearly",
    provider: "razorpay",
    providerPlanId: env.RAZORPAY_PLAN_CANDIDATE_PRO_YEARLY,
    features: {
      jobLimit: -1,
      savedJobsLimit: -1,
      topApplicantBadge: false,
      inmailCredits: 3,
      prioritySupport: false,
      analyticsLevel: "advanced",
    },
    isActive: true,
    isPopular: false,
  },
  {
    code: "candidate_premium_yearly",
    name: "Career Premium (Annual)",
    description: "Stand out to recruiters with Top Applicant badge, priority application listing, & InMail credits for 1 full year.",
    targetRole: "candidate",
    price: 2899,
    currency: "INR",
    billingPeriod: "yearly",
    provider: "razorpay",
    providerPlanId: env.RAZORPAY_PLAN_CANDIDATE_PREMIUM_YEARLY,
    features: {
      jobLimit: -1,
      savedJobsLimit: -1,
      topApplicantBadge: true,
      inmailCredits: 5,
      prioritySupport: true,
      analyticsLevel: "advanced",
    },
    isActive: true,
    isPopular: true,
  },
  {
    code: "recruiter_lite_yearly",
    name: "Recruiter Lite (Annual)",
    description: "Ideal for growing teams posting multiple active jobs and boosting top hires for 1 full year.",
    targetRole: "recruiter",
    price: 9599,
    currency: "INR",
    billingPeriod: "yearly",
    provider: "razorpay",
    providerPlanId: env.RAZORPAY_PLAN_RECRUITER_LITE_YEARLY,
    features: {
      jobLimit: 5,
      featuredJobLimit: 2,
      inmailCredits: 30,
      candidateSearchAccess: true,
      analyticsLevel: "advanced",
    },
    isActive: true,
    isPopular: true,
  },
  {
    code: "recruiter_enterprise_yearly",
    name: "Recruiter Enterprise (Annual)",
    description: "Unlimited hiring scale with 10 Featured Job slots, unlimited candidate search & priority support for 1 full year.",
    targetRole: "recruiter",
    price: 8699,
    currency: "INR",
    billingPeriod: "yearly",
    provider: "razorpay",
    providerPlanId: env.RAZORPAY_PLAN_RECRUITER_ENTERPRISE_YEARLY,
    features: {
      jobLimit: -1,
      featuredJobLimit: 10,
      inmailCredits: -1,
      candidateSearchAccess: true,
      analyticsLevel: "enterprise",
      prioritySupport: true,
    },
    isActive: true,
    isPopular: false,
  },
];

export async function seedDefaultCoupons() {
  try {
    const defaultCoupons = [
      { code: "WELCOME50", discountType: "percentage", discountValue: 50, isActive: true },
      { code: "LAUNCH20", discountType: "percentage", discountValue: 20, isActive: true },
    ];
    for (const c of defaultCoupons) {
      await Coupon.findOneAndUpdate(
        { code: c.code },
        { $setOnInsert: c },
        { upsert: true, returnDocument: "after" }
      );
    }
  } catch (error) {
    console.error("Failed to seed default coupons:", error);
  }
}

export async function validateCouponCode(code: string) {
  await seedDefaultCoupons();
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
  if (!coupon) throw new Error("Invalid or expired promo code");
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    throw new Error("Promo code has expired");
  }
  if (coupon.maxUses !== -1 && coupon.timesUsed >= coupon.maxUses) {
    throw new Error("Promo code usage limit reached");
  }
  return coupon;
}

export async function seedDefaultPlans() {
  try {
    for (const planData of DEFAULT_PLANS) {
      await SubscriptionPlan.findOneAndUpdate(
        { code: planData.code },
        {
          $set: {
            name: planData.name,
            description: planData.description,
            targetRole: planData.targetRole,
            price: planData.price,
            currency: planData.currency,
            billingPeriod: planData.billingPeriod,
            provider: planData.provider,
            providerPlanId: (planData as any).providerPlanId,
            features: planData.features,
            isActive: planData.isActive,
            isPopular: planData.isPopular,
          },
        },
        { upsert: true, returnDocument: "after" }
      );
    }
  } catch (error) {
    console.error("Failed to seed default subscription plans:", error);
  }
}

export async function getSubscriptionPlans(targetRole?: "candidate" | "recruiter") {
  await seedDefaultPlans();
  const query: any = { isActive: true };
  if (targetRole) {
    query.targetRole = targetRole;
  }
  return await SubscriptionPlan.find(query).sort({ price: 1 });
}

export async function getUserSubscriptionDetails(userId: string) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  // 1. Look for the latest active or past_due subscription
  let subscription = await Subscription.findOne({
    userId,
    status: { $in: ["active", "past_due"] },
  })
    .sort({ createdAt: -1 })
    .populate("planId");

  // 2. Auto-Recovery: If active plan is missing or free, check for recent active paid transaction
  if (!subscription || subscription.planCode.includes("free")) {
    const latestPaidTxn = await PaymentTransaction.findOne({
      userId,
      status: "succeeded",
      amount: { $gt: 0 },
    }).sort({ createdAt: -1 });

    if (latestPaidTxn && latestPaidTxn.subscriptionId) {
      const paidSub = await Subscription.findById(latestPaidTxn.subscriptionId).populate("planId");
      if (paidSub && new Date(paidSub.currentPeriodEnd) > new Date()) {
        paidSub.status = "active";
        await paidSub.save();
        subscription = paidSub;
      }
    }
  }

  // Default Fallback: Assign free tier if no subscription exists
  if (!subscription) {
    const defaultCode = user.role === "recruiter" ? "recruiter_free" : "candidate_free";
    let freePlan = await SubscriptionPlan.findOne({ code: defaultCode });

    if (!freePlan) {
      await seedDefaultPlans();
      freePlan = await SubscriptionPlan.findOne({ code: defaultCode });
    }

    if (freePlan) {
      const farFuture = new Date();
      farFuture.setFullYear(farFuture.getFullYear() + 10);

      subscription = await Subscription.create({
        userId,
        planId: freePlan._id,
        planCode: freePlan.code,
        status: "active",
        currentPeriodStart: new Date(),
        currentPeriodEnd: farFuture,
        cancelAtPeriodEnd: false,
        provider: "internal",
        usages: { jobsPostedCount: 0, featuredJobsCount: 0, inmailCreditsUsed: 0 },
      });
      subscription = await subscription.populate("planId");
    }
  }

  if (user.role === "recruiter" && subscription) {
    const activeJobsCount = await Job.countDocuments({
      recruiterId: userId,
      status: JOB_STATUS.ACTIVE,
      isDeleted: false,
    });
    const featuredJobsCount = await Job.countDocuments({
      recruiterId: userId,
      status: JOB_STATUS.ACTIVE,
      isFeatured: true,
      isDeleted: false,
    });

    subscription.usages.jobsPostedCount = activeJobsCount;
    subscription.usages.featuredJobsCount = featuredJobsCount;
  }

  return {
    subscription,
    plan: subscription ? subscription.planId : null,
  };
}

/**
 * Process Verified Subscription Activation (One Active Subscription Rule)
 */
export async function processCheckoutSession(
  userId: string,
  planCode: string,
  paymentMethod: string = "card",
  couponCode?: string,
  razorpayDetails?: {
    orderId?: string;
    paymentId?: string;
    subscriptionId?: string;
  }
) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const targetPlan = await SubscriptionPlan.findOne({ code: planCode, isActive: true });
  if (!targetPlan) throw new Error("Selected plan does not exist or is inactive");

  if (targetPlan.targetRole !== user.role && user.role !== "admin") {
    throw new Error(`Plan ${targetPlan.name} is intended for ${targetPlan.targetRole}s`);
  }

  let finalAmount = targetPlan.price;
  let appliedCoupon = null;

  if (couponCode && couponCode.trim()) {
    try {
      appliedCoupon = await validateCouponCode(couponCode.trim());
      if (appliedCoupon.discountType === "percentage") {
        finalAmount = Math.max(0, finalAmount * (1 - appliedCoupon.discountValue / 100));
      } else {
        finalAmount = Math.max(0, finalAmount - appliedCoupon.discountValue);
      }
      appliedCoupon.timesUsed += 1;
      await appliedCoupon.save();
    } catch (err: any) {
      console.warn("Invalid coupon applied:", err.message);
    }
  }

  const periodEnd = new Date();
  if (targetPlan.billingPeriod === "yearly") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const isFreePlan = targetPlan.price === 0;
  const providerType = isFreePlan ? "internal" : "razorpay";
  const transactionId = razorpayDetails?.paymentId || razorpayDetails?.orderId || `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Idempotency check: Return existing subscription & transaction if this payment was already processed
  const existingTxn = await PaymentTransaction.findOne({ transactionId });
  if (existingTxn) {
    let existingSub = await Subscription.findById(existingTxn.subscriptionId).populate("planId");
    if (existingSub) {
      if (existingSub.status !== "active") {
        existingSub.status = "active";
        await existingSub.save();
      }
      return {
        subscription: existingSub,
        transaction: existingTxn,
      };
    }
  }

  // Determine if this is a recurring subscription (starts with sub_) or a one-time prepaid order
  const isRecurring = Boolean(
    razorpayDetails?.subscriptionId &&
    typeof razorpayDetails.subscriptionId === "string" &&
    razorpayDetails.subscriptionId.startsWith("sub_")
  );

  const newSubscription = await Subscription.create({
    userId,
    planId: targetPlan._id,
    planCode: targetPlan.code,
    status: "active",
    billingType: isRecurring ? "recurring" : "one_time",
    currentPeriodStart: new Date(),
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    provider: providerType,
    providerSubscriptionId: isRecurring ? razorpayDetails?.subscriptionId : undefined,
    providerOrderId: razorpayDetails?.orderId,
    providerPaymentId: razorpayDetails?.paymentId,
    usages: { jobsPostedCount: 0, featuredJobsCount: 0, inmailCreditsUsed: 0 },
  });

  let transaction: any;
  try {
    transaction = await PaymentTransaction.create({
      userId,
      subscriptionId: newSubscription._id,
      planId: targetPlan._id,
      amount: Number(finalAmount.toFixed(2)),
      currency: targetPlan.currency,
      provider: providerType,
      transactionId,
      providerOrderId: razorpayDetails?.orderId,
      providerPaymentId: razorpayDetails?.paymentId,
      providerSubscriptionId: razorpayDetails?.subscriptionId,
      status: "succeeded",
      type: "checkout",
      paymentMethod,
      paidAt: new Date(),
      invoiceUrl: `https://jobsbox.com/invoices/inv_${Date.now()}.pdf`,
      metadata: {
        planName: targetPlan.name,
        planCode: targetPlan.code,
        userEmail: user.email,
        couponUsed: appliedCoupon?.code,
      },
    });

    // Mark other previous subscriptions as canceled, strictly excluding the newly created subscription
    await Subscription.updateMany(
      { userId, status: "active", _id: { $ne: newSubscription._id } },
      { $set: { status: "canceled", cancelAtPeriodEnd: false } }
    );
  } catch (err: any) {
    if (err.code === 11000 || err.name === "MongoServerError" || err.message?.includes("E11000")) {
      // Concurrent race condition: another webhook/request has already inserted this transaction
      const existingTxn = await PaymentTransaction.findOne({ transactionId });
      if (existingTxn) {
        // Clean up redundant duplicate subscription created during this race
        if (newSubscription && newSubscription._id.toString() !== existingTxn.subscriptionId?.toString()) {
          await Subscription.findByIdAndDelete(newSubscription._id).catch(() => { });
        }
        const existingSub = await Subscription.findById(existingTxn.subscriptionId).populate("planId");
        if (existingSub && existingSub.status !== "active") {
          existingSub.status = "active";
          await existingSub.save();
        }
        return {
          subscription: existingSub,
          transaction: existingTxn,
        };
      }
    }
    throw err;
  }

  const invoiceNumber = `INV-${new Date().getFullYear()}-${transaction._id.toString().substring(18).toUpperCase()}`;

  // 1. Real-time In-App Notification & Socket Event
  createNotification({
    recipientId: user._id.toString(),
    type: NOTIFICATION_TYPES.SYSTEM_ALERT,
    title: "Subscription Activated! 🎉",
    body: `Payment of ₹${finalAmount.toLocaleString("en-IN")} for ${targetPlan.name} was successful. Your ${targetPlan.billingPeriod} plan is now live!`,
    link: user.role === "recruiter" ? "/recruiter/billing" : "/candidate/billing",
    metadata: {
      transactionId: transaction._id,
      planCode: targetPlan.code,
      invoiceNumber,
      amount: finalAmount,
    },
  }).catch((err) => console.error("Realtime notification dispatch notice:", err));

  // 2. Automated Email Receipt via Nodemailer
  sendSubscriptionReceiptEmail({
    userName: user.name || "Customer",
    userEmail: user.email,
    planName: targetPlan.name,
    planCode: targetPlan.code,
    billingPeriod: targetPlan.billingPeriod,
    amount: finalAmount,
    currency: targetPlan.currency || "INR",
    transactionId,
    invoiceNumber,
    invoiceUrl: transaction.invoiceUrl || `https://jobsbox.com/invoices/${transaction._id}`,
    expiryDate: periodEnd.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }),
    paymentMethod,
  }).catch((err) => console.error("Subscription receipt email dispatch notice:", err));

  const populatedSub = await newSubscription.populate("planId");

  return {
    subscription: populatedSub,
    transaction,
  };
}

export async function createRazorpayOrderService(userId: string, planCode: string, couponCode?: string) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const targetPlan = await SubscriptionPlan.findOne({ code: planCode, isActive: true });
  if (!targetPlan) throw new Error("Plan not found or inactive");

  let finalPrice = targetPlan.price;
  if (couponCode && couponCode.trim()) {
    try {
      const coupon = await validateCouponCode(couponCode.trim());
      if (coupon.discountType === "percentage") {
        finalPrice = Math.max(0, finalPrice * (1 - coupon.discountValue / 100));
      } else {
        finalPrice = Math.max(0, finalPrice - coupon.discountValue);
      }
    } catch (e) { }
  }

  const { keyId, isConfigured } = getRazorpayCredentials();

  if (!isConfigured) {
    throw new Error("Razorpay API credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are not configured in server environment variables.");
  }

  const amountInPaise = Math.max(100, Math.round(finalPrice * 100));

  let orderData: any = null;
  let rzpSubscription: any = null;

  if (targetPlan.providerPlanId) {
    try {
      rzpSubscription = await createRazorpaySubscription({
        planId: targetPlan.providerPlanId,
        notes: { userId, planCode, couponCode: couponCode || "" },
      });
    } catch (e: any) {
      console.warn("Razorpay Subscription API notice, falling back to Order:", e.message);
    }
  }

  orderData = await createRazorpayOrder({
    amountInRupees: finalPrice,
    currency: "INR",
    receipt: `rcpt_${Date.now()}`,
    notes: { userId, planCode, couponCode: couponCode || "" },
  });

  return {
    orderId: orderData.id,
    subscriptionId: rzpSubscription?.id,
    amount: amountInPaise,
    currency: "INR",
    keyId,
    planName: targetPlan.name,
  };
}

export async function verifyRazorpayPaymentService(
  userId: string,
  orderId: string,
  paymentId: string,
  signature: string,
  planCode: string,
  couponCode?: string,
  subscriptionId?: string
) {
  const effectiveOrderId = orderId || subscriptionId;
  if (!effectiveOrderId && !subscriptionId) {
    throw new Error("Either orderId or subscriptionId must be provided to verify payment signature.");
  }

  const isValid = verifyPaymentSignature({
    orderId: effectiveOrderId,
    paymentId,
    signature,
    subscriptionId,
  });

  if (!isValid) {
    throw new Error("Invalid Razorpay payment signature");
  }

  return await processCheckoutSession(userId, planCode, "razorpay", couponCode, {
    orderId: effectiveOrderId,
    paymentId,
    subscriptionId,
  });
}

export async function handleRazorpayWebhookEvent(rawBody: string | Buffer, signature: string, eventData: any) {
  const isValid = verifyWebhookSignature(rawBody, signature);
  if (!isValid) {
    throw new Error("Invalid Razorpay webhook signature");
  }

  const eventId = eventData?.event_id || eventData?.id || `evt_${Date.now()}`;
  const eventType = eventData?.event || "unknown";

  // Check Webhook Event Idempotency
  const existingEvent = await WebhookEvent.findOne({ provider: "razorpay", eventId });
  if (existingEvent) {
    return { received: true, status: "already_processed" };
  }

  const payload = eventData?.payload || {};

  try {
    if (
      eventType === "payment.captured" ||
      eventType === "order.paid" ||
      eventType === "subscription.charged" ||
      eventType === "subscription.activated"
    ) {
      const entity = payload.payment?.entity || payload.order?.entity || payload.subscription?.entity;
      const notes = entity?.notes || payload.order?.entity?.notes || payload.payment?.entity?.notes || {};
      const userId = notes.userId;
      const planCode = notes.planCode;

      if (userId && planCode) {
        await processCheckoutSession(userId, planCode, "razorpay", notes.couponCode, {
          orderId: payload.order?.entity?.id || entity.order_id,
          paymentId: payload.payment?.entity?.id || (entity.id?.startsWith("pay_") ? entity.id : undefined),
          subscriptionId: entity.subscription_id || (entity.id?.startsWith("sub_") ? entity.id : undefined),
        });
      }
    } else if (eventType === "subscription.cancelled" || eventType === "subscription.completed") {
      const subEntity = payload.subscription?.entity;
      const subId = subEntity?.id;
      if (subId) {
        await Subscription.findOneAndUpdate(
          { providerSubscriptionId: subId },
          { status: eventType === "subscription.cancelled" ? "canceled" : "expired", cancelAtPeriodEnd: true }
        );
      }
    } else if (eventType === "payment.failed") {
      const paymentEntity = payload.payment?.entity;
      const notes = paymentEntity?.notes || {};
      const txnId = paymentEntity?.id || `txn_failed_${Date.now()}`;
      if (notes.userId) {
        const existingTxn = await PaymentTransaction.findOne({ transactionId: txnId });
        if (!existingTxn) {
          try {
            await PaymentTransaction.create({
              userId: notes.userId,
              amount: (paymentEntity.amount || 0) / 100,
              currency: paymentEntity.currency || "INR",
              provider: "razorpay",
              transactionId: txnId,
              providerPaymentId: paymentEntity?.id,
              status: "failed",
              type: "checkout",
              paymentMethod: paymentEntity?.method || "card",
              metadata: { error: paymentEntity?.error_description },
            });
          } catch (e) { }
        }
      }
    }

    try {
      await WebhookEvent.create({
        provider: "razorpay",
        eventId,
        eventType,
        payload: eventData,
        status: "processed",
        processedAt: new Date(),
      });
    } catch (e: any) {
      if (e.code === 11000 || e.message?.includes("E11000")) {
        return { received: true, status: "already_processed" };
      }
    }

    return { received: true, status: "processed" };
  } catch (err: any) {
    try {
      await WebhookEvent.create({
        provider: "razorpay",
        eventId,
        eventType,
        payload: eventData,
        status: "failed",
        processedAt: new Date(),
      });
    } catch (e) { }
    throw err;
  }
}

export async function boostJobToFeatured(recruiterId: string, jobId: string) {
  const job = await Job.findOne({ _id: jobId, recruiterId });
  if (!job) throw new Error("Job listing not found or unauthorized");

  const quota = await verifyUserQuota(recruiterId, "featured_job");
  if (!quota.allowed) {
    throw new Error(quota.message || "Featured job quota limit reached. Please upgrade your recruiter plan.");
  }

  job.isFeatured = true;
  await job.save();

  return job;
}

export async function cancelUserSubscription(userId: string) {
  const activeSub = await Subscription.findOne({ userId, status: "active" });
  if (!activeSub) throw new Error("No active subscription found to cancel");

  if (activeSub.planCode.includes("free") || activeSub.provider === "internal") {
    activeSub.cancelAtPeriodEnd = true;
    await activeSub.save();
    return activeSub;
  }

  // Only invoke Razorpay Subscriptions API for genuine recurring subscriptions (starting with 'sub_')
  const isRecurringRazorpay =
    activeSub.provider === "razorpay" &&
    typeof activeSub.providerSubscriptionId === "string" &&
    activeSub.providerSubscriptionId.startsWith("sub_");

  if (isRecurringRazorpay) {
    try {
      await cancelRazorpaySubscription(activeSub.providerSubscriptionId!, true);
    } catch (err: any) {
      if (err.message?.includes("BAD_REQUEST_ERROR") || err.message?.includes("already cancelled")) {
        console.warn(`[Billing] Razorpay recurring subscription ${activeSub.providerSubscriptionId} already inactive on gateway.`);
      } else {
        console.warn("[Billing] Razorpay API cancel notice:", err.message);
      }
    }
  }

  activeSub.cancelAtPeriodEnd = true;
  await activeSub.save();
  return activeSub;
}

export async function reactivateUserSubscription(userId: string) {
  const activeSub = await Subscription.findOne({ userId, status: "active" });
  if (!activeSub) {
    throw new Error("No active subscription found to reactivate auto-pay");
  }

  if (!activeSub.cancelAtPeriodEnd) {
    return activeSub;
  }

  activeSub.cancelAtPeriodEnd = false;
  await activeSub.save();
  return activeSub;
}

export async function getUserTransactionsHistory(userId: string) {
  return await PaymentTransaction.find({ userId }).sort({ createdAt: -1 });
}

export async function verifyUserQuota(userId: string, quotaType: "post_job" | "featured_job") {
  const { subscription, plan } = await getUserSubscriptionDetails(userId);
  if (!subscription || !plan) {
    throw new Error("Unable to resolve active user subscription");
  }

  const typedPlan = plan as unknown as ISubscriptionPlan;
  const features = typedPlan.features || {};

  if (quotaType === "post_job") {
    const jobLimit = features.jobLimit ?? 1;
    if (jobLimit !== -1) {
      const activeCount = await Job.countDocuments({
        recruiterId: userId,
        status: JOB_STATUS.ACTIVE,
        isDeleted: false,
      });
      if (activeCount >= jobLimit) {
        return {
          allowed: false,
          current: activeCount,
          limit: jobLimit,
          message: `Your current plan (${typedPlan.name}) allows up to ${jobLimit} active job post(s). Please upgrade to Recruiter Lite or Enterprise to post more.`,
        };
      }
    }
  }

  if (quotaType === "featured_job") {
    const featuredLimit = features.featuredJobLimit ?? 0;
    if (featuredLimit !== -1) {
      const activeFeaturedCount = await Job.countDocuments({
        recruiterId: userId,
        status: JOB_STATUS.ACTIVE,
        isFeatured: true,
        isDeleted: false,
      });
      if (activeFeaturedCount >= featuredLimit) {
        return {
          allowed: false,
          current: activeFeaturedCount,
          limit: featuredLimit,
          message: `Your plan allows up to ${featuredLimit} featured job slot(s). Upgrade to Recruiter Enterprise for 10 featured job slots.`,
        };
      }
    }
  }

  return { allowed: true };
}
