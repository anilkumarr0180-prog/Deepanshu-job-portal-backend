import Types from "mongoose";
import crypto from "crypto";
import SubscriptionPlan, { ISubscriptionPlan } from "../models/subscription-plan.model";
import Subscription, { ISubscription } from "../models/subscription.model";
import PaymentTransaction from "../models/payment-transaction.model";
import User from "../models/user.model";
import Job from "../models/job.model";
import Coupon from "../models/coupon.model";
import { JOB_STATUS } from "../constants/job-status";

/**
 * Enterprise Subscription Service
 * Manages plan lifecycle, checkout processing, quota limits, and billing logs.
 */

export const DEFAULT_PLANS = [
  {
    code: "candidate_free",
    name: "Candidate Standard",
    description: "Essential job search and application tools for career growth.",
    targetRole: "candidate",
    price: 0,
    currency: "USD",
    billingPeriod: "monthly",
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
    price: 9.99,
    currency: "USD",
    billingPeriod: "monthly",
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
    price: 19.99,
    currency: "USD",
    billingPeriod: "monthly",
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
    currency: "USD",
    billingPeriod: "monthly",
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
    price: 49.99,
    currency: "USD",
    billingPeriod: "monthly",
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
    price: 149.99,
    currency: "USD",
    billingPeriod: "monthly",
    features: {
      jobLimit: -1, // Unlimited
      featuredJobLimit: 10,
      inmailCredits: -1, // Unlimited
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
        { $setOnInsert: planData },
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

  let subscription = await Subscription.findOne({
    userId,
    status: { $in: ["active", "past_due"] },
  }).populate("planId");

  // Default Fallback: If user has no active subscription, assign Free plan automatically
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
        provider: "mock",
        usages: { jobsPostedCount: 0, featuredJobsCount: 0, inmailCreditsUsed: 0 },
      });
      subscription = await subscription.populate("planId");
    }
  }

  // Calculate actual live usages
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

export async function processCheckoutSession(
  userId: string,
  planCode: string,
  paymentMethod: string = "card",
  couponCode?: string
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

  // Cancel or expire previous active subscriptions
  await Subscription.updateMany(
    { userId, status: "active" },
    { $set: { status: "canceled", cancelAtPeriodEnd: false } }
  );

  // Create new active Subscription
  const newSubscription = await Subscription.create({
    userId,
    planId: targetPlan._id,
    planCode: targetPlan.code,
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    provider: "mock",
    providerSubscriptionId: `sub_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    usages: { jobsPostedCount: 0, featuredJobsCount: 0, inmailCreditsUsed: 0 },
  });

  // Log Payment Transaction Audit Record
  const transaction = await PaymentTransaction.create({
    userId,
    subscriptionId: newSubscription._id,
    planId: targetPlan._id,
    amount: Number(finalAmount.toFixed(2)),
    currency: targetPlan.currency,
    provider: "mock",
    transactionId: `txn_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    status: "succeeded",
    type: "checkout",
    paymentMethod,
    invoiceUrl: `https://jobsbox.com/invoices/inv_mock_${Date.now()}.pdf`,
    metadata: {
      planName: targetPlan.name,
      planCode: targetPlan.code,
      userEmail: user.email,
      couponUsed: appliedCoupon?.code,
    },
  });

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

  let finalPriceUSD = targetPlan.price;
  if (couponCode && couponCode.trim()) {
    try {
      const coupon = await validateCouponCode(couponCode.trim());
      if (coupon.discountType === "percentage") {
        finalPriceUSD = Math.max(0, finalPriceUSD * (1 - coupon.discountValue / 100));
      } else {
        finalPriceUSD = Math.max(0, finalPriceUSD - coupon.discountValue);
      }
    } catch (e) {}
  }

  const amountInPaise = Math.max(100, Math.round(finalPriceUSD * 80 * 100)); // Minimum ₹1 (100 paise)
  const keyId = process.env.RAZORPAY_KEY_ID || "rzp_test_JobsBox2026Key";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "JobsBoxTestSecret2026";
  const authHeader = "Basic " + Buffer.from(keyId.trim() + ":" + keySecret.trim()).toString("base64");

  let realOrderId: string | undefined = undefined;

  try {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: "INR",
        receipt: `rcpt_${Date.now()}`,
      }),
    });

    if (res.ok) {
      const data: any = await res.json();
      realOrderId = data.id;
    } else {
      const errorText = await res.text();
      console.warn("Razorpay API order creation warning:", res.status, errorText);
    }
  } catch (err) {
    console.warn("Razorpay orders API network error:", err);
  }

  return {
    orderId: realOrderId,
    amount: amountInPaise,
    currency: "INR",
    keyId: keyId.trim(),
    planName: targetPlan.name,
    isMock: !realOrderId,
  };
}

export async function verifyRazorpayPaymentService(
  userId: string,
  orderId: string,
  paymentId: string,
  signature: string,
  planCode: string,
  couponCode?: string
) {
  const keySecret = process.env.RAZORPAY_KEY_SECRET || "JobsBoxTestSecret2026";

  if (signature) {
    const generatedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(orderId + "|" + paymentId)
      .digest("hex");

    if (generatedSignature !== signature && process.env.NODE_ENV === "production") {
      throw new Error("Invalid Razorpay payment signature");
    }
  }

  return await processCheckoutSession(userId, planCode, "razorpay", couponCode);
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

  // Free plans don't need cancellation
  if (activeSub.planCode.includes("free")) {
    return activeSub;
  }

  activeSub.cancelAtPeriodEnd = true;
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
