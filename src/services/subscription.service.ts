import { createNotification } from "./notification.service";
import { NOTIFICATION_TYPES } from "../constants/notification-type";
import { sendSubscriptionReceiptEmail } from "./email.service";
import mongoose, { Types } from "mongoose";
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
import {
  createPolarCheckout,
  fetchPolarCheckout,
  getPolarPlanPriceId,
  resolveOrProvisionPolarPriceId,
  verifyPolarWebhookSignature,
  getPolarCredentials,
  findActivePolarSubscriptionByEmail,
} from "./polar.service";

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
    providerMappings: {},
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
    usdPrice: 2,
    description: "Level up your job search with InMail credits, advanced analytics & unlimited saved jobs.",
    targetRole: "candidate",
    price: 99,
    currency: "INR",
    billingPeriod: "monthly",
    provider: "razorpay",
    providerMappings: {
      razorpay: { planId: env.RAZORPAY_PLAN_CANDIDATE_PRO },
    },
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
    usdPrice: 4,
    description: "Stand out to recruiters with Top Applicant badge, priority application listing, & InMail credits.",
    targetRole: "candidate",
    price: 299,
    currency: "INR",
    billingPeriod: "monthly",
    provider: "razorpay",
    providerMappings: {
      razorpay: { planId: env.RAZORPAY_PLAN_CANDIDATE_PREMIUM },
    },
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
    providerMappings: {},
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
    usdPrice: 15,
    description: "Ideal for growing teams posting multiple active jobs and boosting top hires.",
    targetRole: "recruiter",
    price: 999,
    currency: "INR",
    billingPeriod: "monthly",
    provider: "razorpay",
    providerMappings: {
      razorpay: { planId: env.RAZORPAY_PLAN_RECRUITER_LITE },
    },
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
    usdPrice: 99,
    description: "Unlimited hiring scale with 10 Featured Job slots, unlimited candidate search & priority support.",
    targetRole: "recruiter",
    price: 8999,
    currency: "INR",
    billingPeriod: "monthly",
    provider: "razorpay",
    providerMappings: {
      razorpay: { planId: env.RAZORPAY_PLAN_RECRUITER_ENTERPRISE },
    },
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
  {
    code: "candidate_pro_yearly",
    name: "Career Pro (Annual)",
    usdPrice: 19,
    description: "Level up your job search with InMail credits, advanced analytics & unlimited saved jobs for 1 full year.",
    targetRole: "candidate",
    price: 950,
    currency: "INR",
    billingPeriod: "yearly",
    provider: "razorpay",
    providerMappings: {
      razorpay: { planId: env.RAZORPAY_PLAN_CANDIDATE_PRO_YEARLY },
    },
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
    usdPrice: 39,
    description: "Stand out to recruiters with Top Applicant badge, priority application listing, & InMail credits for 1 full year.",
    targetRole: "candidate",
    price: 2899,
    currency: "INR",
    billingPeriod: "yearly",
    provider: "razorpay",
    providerMappings: {
      razorpay: { planId: env.RAZORPAY_PLAN_CANDIDATE_PREMIUM_YEARLY },
    },
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
    usdPrice: 149,
    description: "Ideal for growing teams posting multiple active jobs and boosting top hires for 1 full year.",
    targetRole: "recruiter",
    price: 9599,
    currency: "INR",
    billingPeriod: "yearly",
    provider: "razorpay",
    providerMappings: {
      razorpay: { planId: env.RAZORPAY_PLAN_RECRUITER_LITE_YEARLY },
    },
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
    usdPrice: 799,
    description: "Unlimited hiring scale with 10 Featured Job slots, unlimited candidate search & priority support for 1 full year.",
    targetRole: "recruiter",
    price: 86990,
    currency: "INR",
    billingPeriod: "yearly",
    provider: "razorpay",
    providerMappings: {
      razorpay: { planId: env.RAZORPAY_PLAN_RECRUITER_ENTERPRISE_YEARLY },
    },
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

/**
 * Resolves the Razorpay Plan ID strictly from providerMappings.razorpay.planId (NEW CANONICAL SOURCE OF TRUTH).
 * Free plans (price === 0) do not require a Razorpay mapping and return undefined.
 * Throws an explicit error if a paid plan lacks a Razorpay provider mapping.
 */
export function getRazorpayPlanId(plan: ISubscriptionPlan): string | undefined {
  if (plan.price === 0 || plan.code.includes("free")) {
    return undefined;
  }
  const planId = plan.providerMappings?.razorpay?.planId;
  if (!planId) {
    throw new Error(`Paid plan '${plan.code}' does not have a valid Razorpay provider mapping (providerMappings.razorpay.planId missing).`);
  }
  return planId;
}

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

/**
 * Concurrency-Safe Atomic Coupon Consumption
 */
export async function consumeCouponCode(code: string, session?: mongoose.ClientSession) {
  const normalizedCode = code.trim().toUpperCase();

  const coupon = await Coupon.findOneAndUpdate(
    {
      code: normalizedCode,
      isActive: true,
      $and: [
        { $or: [{ expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] },
        { $or: [{ maxUses: -1 }, { $expr: { $lt: ["$timesUsed", "$maxUses"] } }] },
      ],
    },
    { $inc: { timesUsed: 1 } },
    { session, returnDocument: "after" }
  );

  if (!coupon) {
    const existing = await Coupon.findOne({ code: normalizedCode }, null, { session });
    if (!existing || !existing.isActive) {
      throw new Error("Invalid or inactive promo code");
    }
    if (existing.expiresAt && existing.expiresAt < new Date()) {
      throw new Error("Promo code has expired");
    }
    if (existing.maxUses !== -1 && existing.timesUsed >= existing.maxUses) {
      throw new Error("Promo code usage limit reached");
    }
    throw new Error("Invalid promo code");
  }

  return coupon;
}

export async function seedDefaultPlans() {
  try {
    await seedDefaultCoupons();
    for (const planData of DEFAULT_PLANS) {
      const canonicalRazorpayId = planData.providerMappings?.razorpay?.planId;
      const setPayload: Record<string, any> = {
        name: planData.name,
        usdPrice: (planData as any).usdPrice,
        description: planData.description,
        targetRole: planData.targetRole,
        price: planData.price,
        currency: planData.currency,
        billingPeriod: planData.billingPeriod,
        provider: planData.provider,
        providerPlanId: canonicalRazorpayId,
        features: planData.features,
        isActive: planData.isActive,
        isPopular: planData.isPopular,
      };

      if (planData.providerMappings?.razorpay) {
        setPayload["providerMappings.razorpay"] = planData.providerMappings.razorpay;
      }

      await SubscriptionPlan.findOneAndUpdate(
        { code: planData.code },
        { $set: setPayload },
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

    const plan = subscription.planId as unknown as ISubscriptionPlan;

    return {
      subscription,
      plan,
      usages: {
        activeJobsCount,
        featuredJobsCount,
        jobLimit: plan?.features?.jobLimit ?? 1,
        featuredJobLimit: plan?.features?.featuredJobLimit ?? 0,
        inmailCredits: plan?.features?.inmailCredits ?? 0,
        candidateSearchAccess: plan?.features?.candidateSearchAccess ?? false,
      },
    };
  }

  const plan = subscription ? (subscription.planId as unknown as ISubscriptionPlan) : null;
  return { subscription, plan };
}

/**
 * Process Verified Subscription Activation (Strict Transactional Execution)
 */
export async function processCheckoutSession(
  userId: string,
  planCode: string,
  paymentMethod: string = "card",
  couponCode?: string,
  providerDetails?: {
    orderId?: string;
    paymentId?: string;
    subscriptionId?: string;
    checkoutId?: string;
    provider?: "razorpay" | "polar" | "internal" | "mock";
  }
) {
  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const targetPlan = await SubscriptionPlan.findOne({ code: planCode, isActive: true });
  if (!targetPlan) throw new Error("Selected plan does not exist or is inactive");

  if (targetPlan.targetRole !== user.role && user.role !== "admin") {
    throw new Error(`Plan ${targetPlan.name} is intended for ${targetPlan.targetRole}s`);
  }

  const periodEnd = new Date();
  if (targetPlan.billingPeriod === "yearly") {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  const isFreePlan = targetPlan.price === 0;
  const providerType: "internal" | "razorpay" | "polar" | "mock" = isFreePlan
    ? "internal"
    : providerDetails?.provider || (paymentMethod === "polar" ? "polar" : "razorpay");

  const transactionId =
    providerDetails?.paymentId ||
    providerDetails?.checkoutId ||
    providerDetails?.orderId ||
    `txn_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const isRecurring = Boolean(
    providerDetails?.subscriptionId &&
    typeof providerDetails.subscriptionId === "string" &&
    (providerDetails.subscriptionId.startsWith("sub_") || providerDetails.provider === "polar")
  );

  let newSubscription: ISubscription | null = null;
  let transaction: any = null;
  const isPolar = providerType === "polar" || paymentMethod === "polar";
  const basePlanPrice = isPolar
    ? (targetPlan.usdPrice !== undefined && targetPlan.usdPrice !== null ? targetPlan.usdPrice : (targetPlan.price > 0 ? Math.round(targetPlan.price / 80) : 0))
    : targetPlan.price;
  let finalAmount = basePlanPrice;
  let appliedCoupon: any = null;

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // 1. Idempotency Check within Transaction Scope
    const existingTxn = await PaymentTransaction.findOne({ transactionId }, null, { session });
    if (existingTxn) {
      let existingSub = await Subscription.findById(existingTxn.subscriptionId, null, { session }).populate("planId");
      if (existingSub && existingSub.status !== "active") {
        existingSub.status = "active";
        await existingSub.save({ session });
      }
      await session.commitTransaction();
      return {
        subscription: existingSub,
        transaction: existingTxn,
      };
    }

    // 2. Consume coupon atomically inside transaction session
    if (couponCode && couponCode.trim()) {
      appliedCoupon = await consumeCouponCode(couponCode.trim(), session);
      if (appliedCoupon.discountType === "percentage") {
        finalAmount = Math.max(0, finalAmount * (1 - appliedCoupon.discountValue / 100));
      } else {
        finalAmount = Math.max(0, finalAmount - appliedCoupon.discountValue);
      }
    }

    // 3. Atomically transition user's existing active subscription(s) to 'canceled'
    await Subscription.updateMany(
      { userId, status: "active" },
      { $set: { status: "canceled", cancelAtPeriodEnd: false } },
      { session }
    );

    // 4. Create new active subscription within transaction
    const subDocs = await Subscription.create(
      [
        {
          userId,
          planId: targetPlan._id,
          planCode: targetPlan.code,
          status: "active",
          billingType: isRecurring ? "recurring" : "one_time",
          currentPeriodStart: new Date(),
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          provider: providerType,
          providerSubscriptionId: isRecurring ? providerDetails?.subscriptionId : undefined,
          providerOrderId: providerDetails?.orderId,
          providerPaymentId: providerDetails?.paymentId || providerDetails?.checkoutId,
          usages: { jobsPostedCount: 0, featuredJobsCount: 0, inmailCreditsUsed: 0 },
        },
      ],
      { session }
    );
    newSubscription = subDocs[0];

    // 5. Create PaymentTransaction document within transaction
    const txnDocs = await PaymentTransaction.create(
      [
        {
          userId,
          subscriptionId: newSubscription._id,
          planId: targetPlan._id,
          amount: Number(finalAmount.toFixed(2)),
          currency: isPolar ? "USD" : targetPlan.currency,
          provider: providerType,
          transactionId,
          providerOrderId: providerDetails?.orderId,
          providerPaymentId: providerDetails?.paymentId || providerDetails?.checkoutId,
          providerSubscriptionId: providerDetails?.subscriptionId,
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
        },
      ],
      { session }
    );
    transaction = txnDocs[0];

    await session.commitTransaction();
  } catch (err: any) {
    await session.abortTransaction().catch(() => {});
    throw err;
  } finally {
    await session.endSession().catch(() => {});
  }

  const invoiceNumber = `INV-${new Date().getFullYear()}-${transaction._id.toString().substring(18).toUpperCase()}`;
  const txCurrency = isPolar ? "USD" : (targetPlan.currency || "INR");
  const formattedTxAmount = isPolar 
    ? `${finalAmount.toLocaleString("en-US")} USD`
    : `₹${finalAmount.toLocaleString("en-IN")}`;

  // Real-time In-App Notification & Socket Event (Strictly Post-Commit)
  createNotification({
    recipientId: user._id.toString(),
    type: NOTIFICATION_TYPES.SYSTEM_ALERT,
    title: "Subscription Activated! 🎉",
    body: `Payment of ${formattedTxAmount} for ${targetPlan.name} was successful. Your ${targetPlan.billingPeriod} plan is now live!`,
    link: user.role === "recruiter" ? "/recruiter/billing" : "/candidate/billing",
    metadata: {
      transactionId: transaction._id,
      planCode: targetPlan.code,
      invoiceNumber,
      amount: finalAmount,
    },
  }).catch((err) => console.error("Realtime notification dispatch notice:", err));

  // Automated Email Receipt via Nodemailer (Strictly Post-Commit)
  sendSubscriptionReceiptEmail({
    userName: user.name || "Customer",
    userEmail: user.email,
    planName: targetPlan.name,
    planCode: targetPlan.code,
    billingPeriod: targetPlan.billingPeriod,
    amount: finalAmount,
    currency: txCurrency,
    transactionId,
    invoiceNumber,
    invoiceUrl: transaction.invoiceUrl || `https://jobsbox.com/invoices/${transaction._id}`,
    expiryDate: periodEnd.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }),
    paymentMethod,
  }).catch((err) => console.error("Subscription receipt email dispatch notice:", err));

  const populatedSub = await newSubscription!.populate("planId");

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

  const razorpayPlanId = getRazorpayPlanId(targetPlan);
  if (razorpayPlanId) {
    try {
      rzpSubscription = await createRazorpaySubscription({
        planId: razorpayPlanId,
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

export async function createPolarCheckoutService(
  userId: string,
  planCode: string,
  couponCode?: string,
  successUrl?: string
) {
  if (successUrl && !isValidSuccessUrl(successUrl)) {
    throw new Error("Invalid successUrl origin. Only trusted redirect domains are allowed.");
  }

  if (successUrl && !isValidSuccessUrl(successUrl)) {
    throw new Error("Invalid successUrl origin. Only trusted redirect domains are allowed.");
  }

  const user = await User.findById(userId);
  if (!user) throw new Error("User not found");

  const targetPlan = await SubscriptionPlan.findOne({ code: planCode });
  if (!targetPlan) throw new Error("Selected plan does not exist");
  if (!targetPlan.isActive) throw new Error("Selected plan is inactive");

  if (targetPlan.targetRole !== user.role && user.role !== "admin") {
    throw new Error(`Plan ${targetPlan.name} is intended for ${targetPlan.targetRole}s`);
  }

  if (targetPlan.price === 0 || targetPlan.code.includes("free") || targetPlan.provider === "internal") {
    throw new Error("Free or internal plans cannot be checked out via Polar gateway.");
  }

  const priceId = await resolveOrProvisionPolarPriceId(targetPlan);
  if (!priceId) {
    throw new Error(`Paid plan '${targetPlan.code}' does not have a valid Polar provider mapping (providerMappings.polar.priceId missing).`);
  }

  let finalPrice = targetPlan.price;
  if (couponCode && couponCode.trim()) {
    const coupon = await validateCouponCode(couponCode.trim());
    if (coupon.discountType === "percentage") {
      finalPrice = Math.max(0, finalPrice * (1 - coupon.discountValue / 100));
    } else {
      finalPrice = Math.max(0, finalPrice - coupon.discountValue);
    }
  }

  // ─── UPGRADE PATH: user already has an active Polar subscription ─────────
  // Polar Sandbox does NOT support PATCH-based plan changes (no plan-change field exists in any
  // union variant). The only supported upgrade path is:
  //   1. Revoke the current subscription via PATCH { revoke: true }
  //   2. Send the user to a fresh Polar checkout for the new plan (email is now free)

  // Step 1: Check our DB for an existing Polar subscription
  let existingPolarSubId: string | undefined;
  const dbPolarSub = await Subscription.findOne({
    userId,
    status: { $in: ["active", "past_due"] },
    provider: "polar",
    providerSubscriptionId: { $exists: true, $nin: [null, ""] },
  }).sort({ createdAt: -1 });

  if (dbPolarSub?.providerSubscriptionId) {
    existingPolarSubId = dbPolarSub.providerSubscriptionId;
    console.log(`[Polar Upgrade] Found existing Polar sub in DB: ${existingPolarSubId}`);
  }

  // Step 2: If not in DB, query Polar API directly by user email
  if (!existingPolarSubId && user.email) {
    const polarSubId = await findActivePolarSubscriptionByEmail(user.email);
    if (polarSubId) {
      existingPolarSubId = polarSubId;
      console.log(`[Polar Upgrade] Found existing Polar sub via API query: ${existingPolarSubId}`);
    }
  }

  // Step 3: If existing active Polar subscription found → revoke it, then create fresh checkout
  if (existingPolarSubId) {
    console.log(`[Polar Upgrade] Revoking subscription ${existingPolarSubId} to allow plan upgrade to: ${planCode}`);
    try {
      const { accessToken, serverUrl } = getPolarCredentials();
      const revokeRes = await fetch(`${serverUrl}/v1/subscriptions/${existingPolarSubId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ revoke: true }),
        signal: AbortSignal.timeout(10000),
      });
      if (!revokeRes.ok) {
        const errText = await revokeRes.text();
        console.warn(`[Polar Upgrade] Revoke failed (HTTP ${revokeRes.status}): ${errText} — proceeding to checkout anyway`);
      } else {
        console.log(`[Polar Upgrade] Revoked existing subscription ${existingPolarSubId} successfully`);
        // Mark old subscription as canceled in DB so our quota/access logic is clean
        await Subscription.updateMany(
          { userId, providerSubscriptionId: existingPolarSubId },
          { $set: { status: "canceled", cancelAtPeriodEnd: false } }
        );
      }
    } catch (revokeErr: any) {
      console.warn("[Polar Upgrade] Revoke request error:", revokeErr.message);
    }
  }

  // ─── CHECKOUT PATH: create new Polar checkout (for both upgrades and new subscriptions) ───
  const checkoutData = await createPolarCheckout({
    priceId,
    userId,
    userEmail: user.email,
    userName: user.name,
    planCode,
    couponCode,
    successUrl,
  });

  return {
    checkoutId: checkoutData.id,
    url: checkoutData.url,
    priceId,
    amount: Number(finalPrice.toFixed(2)),
    currency: targetPlan.currency || "INR",
    planName: targetPlan.name,
    status: checkoutData.status,
    upgraded: !!existingPolarSubId,
  };
}


export async function verifyPolarPaymentService(
  userId: string,
  checkoutId: string,
  planCode?: string,
  couponCode?: string
) {
  if (!checkoutId) {
    throw new Error("checkoutId is required to verify Polar payment.");
  }

  let checkout: any;
  try {
    checkout = await fetchPolarCheckout(checkoutId);
  } catch (err: any) {
    throw new Error(`Polar payment verification failed: ${err.message}`);
  }

  const statusLower = (checkout.status || "").toLowerCase();
  const validStatuses = ["succeeded", "confirmed", "complete"];
  if (!validStatuses.includes(statusLower)) {
    throw new Error(`Polar checkout is not in a confirmed payment state. Current status: '${checkout.status}'.`);
  }

  const effectivePlanCode = planCode || checkout.metadata?.userId === userId ? (planCode || checkout.metadata?.planCode) : checkout.metadata?.planCode;
  const targetPlanCode = effectivePlanCode || planCode;

  if (!targetPlanCode) {
    throw new Error("planCode could not be resolved for Polar checkout verification.");
  }

  const effectiveCouponCode = couponCode || checkout.metadata?.couponCode;

  return await processCheckoutSession(userId, targetPlanCode, "polar", effectiveCouponCode, {
    checkoutId: checkout.id,
    paymentId: checkout.id,
    subscriptionId: checkout.subscriptionId,
    provider: "polar",
  });
}

export async function handlePolarWebhookEvent(rawBody: string | Buffer, signature: string, eventData: any) {
  const isValid = verifyPolarWebhookSignature(rawBody, signature);
  if (!isValid) {
    throw new Error("Invalid Polar webhook signature");
  }

  const eventId = eventData?.id || eventData?.event_id || `evt_polar_${Date.now()}`;
  const eventType = eventData?.type || eventData?.event || "unknown";

  let webhookDoc: any;
  try {
    webhookDoc = await WebhookEvent.create({
      provider: "polar",
      eventId,
      eventType,
      payload: eventData,
      status: "processed",
      processedAt: new Date(),
    });
  } catch (err: any) {
    if (err.code === 11000 || err.name === "MongoServerError" || err.message?.includes("E11000")) {
      return { received: true, status: "already_processed" };
    }
    throw err;
  }

  const data = eventData?.data || eventData;

  try {
    if (eventType === "checkout.created" || eventType === "checkout.updated") {
      const checkoutState = (data?.status || "").toLowerCase();
      if (checkoutState === "succeeded" || checkoutState === "confirmed") {
        const metadata = data?.metadata || {};
        const userId = metadata.userId;
        const planCode = metadata.planCode;
        const checkoutId = data?.id;
        const subscriptionId = data?.subscription_id;

        if (userId && planCode && checkoutId) {
          await processCheckoutSession(userId, planCode, "polar", metadata.couponCode, {
            checkoutId,
            paymentId: checkoutId,
            subscriptionId,
            provider: "polar",
          });
        }
      }
    } else if (eventType === "subscription.revoked" || eventType === "subscription.cancelled") {
      const subId = data?.id || data?.subscription_id;
      if (subId) {
        await Subscription.findOneAndUpdate(
          { providerSubscriptionId: subId },
          { status: "canceled", cancelAtPeriodEnd: false }
        );
      }
    }

    return { received: true, status: "processed" };
  } catch (err: any) {
    await WebhookEvent.deleteOne({ _id: webhookDoc._id }).catch(() => {});
    throw err;
  }
}

export async function handleRazorpayWebhookEvent(rawBody: string | Buffer, signature: string, eventData: any) {
  const isValid = verifyWebhookSignature(rawBody, signature);
  if (!isValid) {
    throw new Error("Invalid Razorpay webhook signature");
  }

  const eventId = eventData?.event_id || eventData?.id || `evt_${Date.now()}`;
  const eventType = eventData?.event || "unknown";

  // 1. Atomic Claim of Webhook Event via DB Unique Index
  let webhookDoc: any;
  try {
    webhookDoc = await WebhookEvent.create({
      provider: "razorpay",
      eventId,
      eventType,
      payload: eventData,
      status: "processed",
      processedAt: new Date(),
    });
  } catch (err: any) {
    if (err.code === 11000 || err.name === "MongoServerError" || err.message?.includes("E11000")) {
      return { received: true, status: "already_processed" };
    }
    throw err;
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

    return { received: true, status: "processed" };
  } catch (err: any) {
    // If business processing fails after atomic claim, remove claimed event document so future retries can process
    await WebhookEvent.deleteOne({ _id: webhookDoc._id }).catch(() => {});
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

  // Polar subscription cancellation: use PATCH { revoke: true } (Polar has no DELETE endpoint)
  // This is the SubscriptionRevoke discriminant confirmed via live API probe.
  const isPolar = activeSub.provider === "polar";
  if (isPolar && activeSub.providerSubscriptionId) {
    try {
      const { accessToken, serverUrl } = getPolarCredentials();
      const response = await fetch(`${serverUrl}/v1/subscriptions/${activeSub.providerSubscriptionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ revoke: true }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`[Billing] Polar API cancel failed: HTTP ${response.status} - ${errorText}`);
      } else {
        activeSub.status = "canceled";
        activeSub.cancelAtPeriodEnd = false;
        await activeSub.save();
        return activeSub;
      }
    } catch (err: any) {
      console.warn("[Billing] Polar API cancel notice:", err.message);
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

function isValidSuccessUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    const allowed = [
      "https://deepanshu-job-portal-frontend-five.vercel.app",
      "http://localhost:5173",
      "http://localhost:5174",
      ...(process.env.ALLOWED_ORIGINS
        ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
        : []),
    ];
    return allowed.includes(parsed.origin);
  } catch {
    return false;
  }
}
