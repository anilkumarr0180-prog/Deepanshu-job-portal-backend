import Application from "../models/application.model";
import Job from "../models/job.model";
import User from "../models/user.model";
import PaymentTransaction from "../models/payment-transaction.model";
import SubscriptionPlan from "../models/subscription-plan.model";
import Subscription from "../models/subscription.model";
import Coupon from "../models/coupon.model";
import { USER_ROLES } from "../constants/roles";
import { JOB_STATUS } from "../constants/job-status";
import { AppError } from "../utils/app-error";
import { HTTP_STATUS } from "../constants/http-status";
import { sanitizeUser } from "../utils/sanitize-user";
import {
  getPaginationOptions,
  buildPaginatedResult,
} from "../utils/pagination";

interface UserFilters {
  page?: number | string;
  limit?: number | string;
  search?: string;
  role?: string;
  isBlocked?: string;
  sort?: string;
}

interface AdminJobFilters {
  page?: number | string;
  limit?: number | string;
  search?: string;
  recruiterId?: string;
  status?: string;
  sort?: string;
}

interface AdminTransactionFilters {
  page?: number | string;
  limit?: number | string;
  search?: string;
  status?: string;
  provider?: string;
  startDate?: string;
  endDate?: string;
  sort?: string;
}

/*
|--------------------------------------------------------------------------
| Admin Dashboard Statistics
|--------------------------------------------------------------------------
*/

export const getDashboardStats = async () => {
  const now = new Date();

  // Start of Today (00:00:00.000)
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );

  // Start of Current Week (Monday 00:00:00.000)
  const dayOfWeek = now.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - diffToMonday
  );

  // Start of Current Month (1st 00:00:00.000)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalUsers,
    totalRecruiters,
    totalCandidates,
    activeRecruiters,
    activeCandidates,
    blockedUsers,
    totalJobs,
    activeJobs,
    closedJobs,
    draftJobs,
    totalApplications,
    applicationsToday,
    applicationsThisWeek,
    applicationsThisMonth,
    recentUsers,
    recentJobs,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ role: USER_ROLES.RECRUITER }),
    User.countDocuments({ role: USER_ROLES.CANDIDATE }),
    User.countDocuments({ role: USER_ROLES.RECRUITER, isBlocked: false }),
    User.countDocuments({ role: USER_ROLES.CANDIDATE, isBlocked: false }),
    User.countDocuments({ isBlocked: true }),
    Job.countDocuments(),
    Job.countDocuments({ status: JOB_STATUS.ACTIVE }),
    Job.countDocuments({ status: JOB_STATUS.CLOSED }),
    Job.countDocuments({ status: JOB_STATUS.DRAFT }),
    Application.countDocuments(),
    Application.countDocuments({ createdAt: { $gte: startOfToday } }),
    Application.countDocuments({ createdAt: { $gte: startOfWeek } }),
    Application.countDocuments({ createdAt: { $gte: startOfMonth } }),
    User.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select("-password")
      .lean(),
    Job.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("recruiterId", "name email")
      .lean(),
  ]);

  return {
    users: {
      totalUsers,
      totalRecruiters,
      totalCandidates,
      activeRecruiters,
      activeCandidates,
      blockedUsers,
    },
    jobs: {
      totalJobs,
      activeJobs,
      closedJobs,
      draftJobs,
    },
    applications: {
      totalApplications,
      applicationsToday,
      applicationsThisWeek,
      applicationsThisMonth,
    },
    recentUsers,
    recentJobs,
  };
};

/*
|--------------------------------------------------------------------------
| Regex Escape Helper
|--------------------------------------------------------------------------
*/
const escapeRegex = (text: string): string => {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/*
|--------------------------------------------------------------------------
| Get All Users + Search + Filter + Pagination + Sorting
|--------------------------------------------------------------------------
*/

export const getUsers = async (filters: UserFilters = {}) => {
  const query: Record<string, unknown> = {};

  if (filters.search) {
    const trimmedSearch = filters.search.trim();
    if (trimmedSearch) {
      const escaped = escapeRegex(trimmedSearch);
      query.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { email: { $regex: escaped, $options: "i" } },
      ];
    }
  }

  if (filters.role) {
    query.role = filters.role;
  }

  if (filters.isBlocked !== undefined) {
    query.isBlocked = filters.isBlocked === "true";
  }

  const { page, limit, skip } = getPaginationOptions(filters);

  let sortOptions: Record<string, 1 | -1> = { createdAt: -1 };

  switch (filters.sort) {
    case "oldest":
      sortOptions = { createdAt: 1 };
      break;
    case "name-asc":
      sortOptions = { name: 1 };
      break;
    case "name-desc":
      sortOptions = { name: -1 };
      break;
    default:
      sortOptions = { createdAt: -1 };
  }

  const [users, totalUsers] = await Promise.all([
    User.find(query)
      .select("-password")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(query),
  ]);

  return buildPaginatedResult(users, totalUsers, page, limit);
};

/*
|--------------------------------------------------------------------------
| Get User By ID
|--------------------------------------------------------------------------
*/

export const getUserById = async (userId: string) => {
  const user = await User.findById(userId).select("-password").lean();

  if (!user) {
    throw new AppError("User not found.", HTTP_STATUS.NOT_FOUND);
  }

  return user;
};

/*
|--------------------------------------------------------------------------
| Block User
|--------------------------------------------------------------------------
*/

export const blockUser = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError("User not found.", HTTP_STATUS.NOT_FOUND);
  }

  if (user.role === USER_ROLES.ADMIN) {
    throw new AppError("Cannot block an admin user.", HTTP_STATUS.FORBIDDEN);
  }

  if (user.isBlocked) {
    throw new AppError("User is already blocked.", HTTP_STATUS.BAD_REQUEST);
  }

  user.isBlocked = true;
  await user.save();

  return sanitizeUser(user);
};

/*
|--------------------------------------------------------------------------
| Unblock User
|--------------------------------------------------------------------------
*/

export const unblockUser = async (userId: string) => {
  const user = await User.findById(userId);

  if (!user) {
    throw new AppError("User not found.", HTTP_STATUS.NOT_FOUND);
  }

  if (user.role === USER_ROLES.ADMIN) {
    throw new AppError(
      "Cannot perform this action on an admin account.",
      HTTP_STATUS.FORBIDDEN
    );
  }

  if (!user.isBlocked) {
    throw new AppError("User is already active.", HTTP_STATUS.BAD_REQUEST);
  }

  user.isBlocked = false;
  await user.save();

  return sanitizeUser(user);
};

/*
|--------------------------------------------------------------------------
| Get Admin Jobs + Search + Filters + Pagination + Sorting
|--------------------------------------------------------------------------
*/

export const getAdminJobs = async (filters: AdminJobFilters = {}) => {
  const query: Record<string, unknown> = {};

  if (filters.search) {
    const trimmedSearch = filters.search.trim();
    if (trimmedSearch) {
      const escaped = escapeRegex(trimmedSearch);
      query.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { company: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ];
    }
  }

  if (filters.recruiterId) {
    query.recruiterId = filters.recruiterId;
  }

  if (filters.status) {
    query.status = filters.status;
  }

  const { page, limit, skip } = getPaginationOptions(filters);

  let sortOptions: Record<string, 1 | -1> = { createdAt: -1 };

  switch (filters.sort) {
    case "oldest":
      sortOptions = { createdAt: 1 };
      break;
    case "salary-high":
      sortOptions = { salaryMax: -1 };
      break;
    case "salary-low":
      sortOptions = { salaryMin: 1 };
      break;
    default:
      sortOptions = { createdAt: -1 };
  }

  const [jobs, totalJobs] = await Promise.all([
    Job.find(query)
      .populate("recruiterId", "name email")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    Job.countDocuments(query),
  ]);

  return buildPaginatedResult(jobs, totalJobs, page, limit);
};

/*
|--------------------------------------------------------------------------
| Delete Admin Job
|--------------------------------------------------------------------------
*/

export const deleteAdminJob = async (jobId: string) => {
  const existingApplication = await Application.findOne({ jobId });

  if (existingApplication) {
    throw new AppError(
      "Cannot delete a job with existing applications. Close the job instead.",
      HTTP_STATUS.CONFLICT
    );
  }

  const job = await Job.findById(jobId);

  if (!job) {
    throw new AppError("Job not found.", HTTP_STATUS.NOT_FOUND);
  }

  await job.deleteOne();

  return null;
};

/*
|--------------------------------------------------------------------------
| Verify Company (Admin Only)
|--------------------------------------------------------------------------
*/
export const verifyCompany = async (companyId: string, isVerified: boolean) => {
  const Company = (await import("../models/company.model")).default;
  const company = await Company.findById(companyId);

  if (!company) {
    throw new AppError("Company not found.", HTTP_STATUS.NOT_FOUND);
  }

  company.isVerified = isVerified;
  await company.save();

  // Efficient cascade update using updateMany() if company is unverified
  if (!isVerified) {
    await Job.updateMany(
      { recruiterId: company.recruiterId, status: JOB_STATUS.ACTIVE },
      { $set: { status: JOB_STATUS.CLOSED } }
    );
  }

  return company;
};

/*
|--------------------------------------------------------------------------
| FINANCE & BILLING COMMAND CENTER (Enterprise Production Grade)
|--------------------------------------------------------------------------
*/

/**
 * Get Comprehensive Financial Overview, MRR, KPIs & 30-Day Revenue Trend
 */
export const getFinanceOverview = async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const [
    revenueAgg,
    activePaidSubsCount,
    totalTransactionsCount,
    succeededTxnCount,
    failedTxnCount,
    thirtyDayTimeSeries,
    recentTransactions,
  ] = await Promise.all([
    // Total gross volume
    PaymentTransaction.aggregate([
      { $match: { status: "succeeded" } },
      { $group: { _id: null, totalGross: { $sum: "$amount" }, avgOrderValue: { $avg: "$amount" } } },
    ]),
    // Active paid subscriptions count
    Subscription.countDocuments({
      status: "active",
      planCode: { $not: /free/i },
    }),
    // Total transactions
    PaymentTransaction.countDocuments(),
    // Succeeded count
    PaymentTransaction.countDocuments({ status: "succeeded" }),
    // Failed count
    PaymentTransaction.countDocuments({ status: "failed" }),
    // 30-day daily revenue time series
    PaymentTransaction.aggregate([
      {
        $match: {
          status: "succeeded",
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          dailyRevenue: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    // Recent 5 transactions
    PaymentTransaction.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("userId", "name email role")
      .populate("planId", "name code price billingPeriod")
      .lean(),
  ]);

  const totalGross = revenueAgg[0]?.totalGross || 0;
  const avgOrderValue = Number((revenueAgg[0]?.avgOrderValue || 0).toFixed(2));
  const successRate =
    totalTransactionsCount > 0
      ? Number(((succeededTxnCount / totalTransactionsCount) * 100).toFixed(1))
      : 100;

  // Calculate MRR from active paid subscriptions
  const activePaidSubs = await Subscription.find({
    status: "active",
    planCode: { $not: /free/i },
  }).populate("planId");

  let calculatedMRR = 0;
  for (const sub of activePaidSubs) {
    const plan = sub.planId as any;
    if (plan && typeof plan.price === "number") {
      if (plan.billingPeriod === "yearly") {
        calculatedMRR += plan.price / 12;
      } else {
        calculatedMRR += plan.price;
      }
    }
  }

  return {
    kpi: {
      totalGross: Number(totalGross.toFixed(2)),
      mrr: Number(calculatedMRR.toFixed(2)),
      activePaidSubscriptions: activePaidSubsCount,
      avgOrderValue,
      totalTransactions: totalTransactionsCount,
      succeededTransactions: succeededTxnCount,
      failedTransactions: failedTxnCount,
      successRate,
    },
    thirtyDayTimeSeries: thirtyDayTimeSeries.map((item) => ({
      date: item._id,
      revenue: Number(item.dailyRevenue.toFixed(2)),
      transactions: item.count,
    })),
    recentTransactions,
  };
};

/**
 * Get Paginated Transactions with Search & Filters
 */
export const getAdminTransactions = async (filters: AdminTransactionFilters = {}) => {
  const query: Record<string, unknown> = {};

  if (filters.status) {
    query.status = filters.status;
  }

  if (filters.provider) {
    query.provider = filters.provider;
  }

  if (filters.startDate || filters.endDate) {
    const dateQuery: Record<string, Date> = {};
    if (filters.startDate) dateQuery.$gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      dateQuery.$lte = end;
    }
    query.createdAt = dateQuery;
  }

  if (filters.search) {
    const trimmed = filters.search.trim();
    if (trimmed) {
      const escaped = escapeRegex(trimmed);
      // Search by transactionId or user details
      const matchedUsers = await User.find({
        $or: [
          { name: { $regex: escaped, $options: "i" } },
          { email: { $regex: escaped, $options: "i" } },
        ],
      }).select("_id");

      const userIds = matchedUsers.map((u) => u._id);

      query.$or = [
        { transactionId: { $regex: escaped, $options: "i" } },
        { providerOrderId: { $regex: escaped, $options: "i" } },
        { providerPaymentId: { $regex: escaped, $options: "i" } },
        { userId: { $in: userIds } },
      ];
    }
  }

  const { page, limit, skip } = getPaginationOptions(filters);

  let sortOptions: Record<string, 1 | -1> = { createdAt: -1 };
  if (filters.sort === "amount-high") sortOptions = { amount: -1 };
  if (filters.sort === "amount-low") sortOptions = { amount: 1 };
  if (filters.sort === "oldest") sortOptions = { createdAt: 1 };

  const [transactions, total] = await Promise.all([
    PaymentTransaction.find(query)
      .populate("userId", "name email role")
      .populate("planId", "name code price billingPeriod")
      .populate("subscriptionId")
      .sort(sortOptions)
      .skip(skip)
      .limit(limit)
      .lean(),
    PaymentTransaction.countDocuments(query),
  ]);

  return buildPaginatedResult(transactions, total, page, limit);
};

/**
 * Get All Subscription Plans (Active and Inactive)
 */
export const getAdminPlans = async () => {
  return await SubscriptionPlan.find().sort({ targetRole: 1, price: 1 }).lean();
};

/**
 * Create a Custom Subscription Plan
 */
export const createAdminPlan = async (data: {
  code: string;
  name: string;
  description: string;
  targetRole: "candidate" | "recruiter";
  price: number;
  currency?: string;
  billingPeriod?: "monthly" | "yearly";
  features: Record<string, any>;
  provider?: "internal" | "stripe" | "razorpay";
  providerPlanId?: string;
  isActive?: boolean;
  isPopular?: boolean;
}) => {
  const existing = await SubscriptionPlan.findOne({ code: data.code.trim().toLowerCase() });
  if (existing) {
    throw new AppError(`Plan with code "${data.code}" already exists.`, HTTP_STATUS.CONFLICT);
  }

  const newPlan = await SubscriptionPlan.create({
    ...data,
    code: data.code.trim().toLowerCase(),
    currency: data.currency || "INR",
    billingPeriod: data.billingPeriod || "monthly",
    provider: data.provider || "razorpay",
    isActive: data.isActive !== undefined ? data.isActive : true,
  });

  return newPlan;
};

/**
 * Update an Existing Subscription Plan
 */
export const updateAdminPlan = async (
  planId: string,
  data: Partial<{
    name: string;
    description: string;
    price: number;
    currency: string;
    billingPeriod: "monthly" | "yearly";
    features: Record<string, any>;
    providerPlanId: string;
    isActive: boolean;
    isPopular: boolean;
  }>
) => {
  const plan = await SubscriptionPlan.findById(planId);
  if (!plan) {
    throw new AppError("Subscription plan not found.", HTTP_STATUS.NOT_FOUND);
  }

  if (data.name !== undefined) plan.name = data.name;
  if (data.description !== undefined) plan.description = data.description;
  if (data.price !== undefined) plan.price = Math.max(0, data.price);
  if (data.currency !== undefined) plan.currency = data.currency;
  if (data.billingPeriod !== undefined) plan.billingPeriod = data.billingPeriod;
  if (data.features !== undefined) plan.features = { ...plan.features, ...data.features };
  if (data.providerPlanId !== undefined) plan.providerPlanId = data.providerPlanId;
  if (data.isActive !== undefined) plan.isActive = data.isActive;
  if (data.isPopular !== undefined) plan.isPopular = data.isPopular;

  await plan.save();
  return plan;
};

/**
 * Get All Discount & Promo Coupons
 */
export const getAdminCoupons = async () => {
  return await Coupon.find().sort({ createdAt: -1 }).lean();
};

/**
 * Create a Discount Coupon
 */
export const createAdminCoupon = async (data: {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxUses?: number;
  expiresAt?: string | Date;
  isActive?: boolean;
}) => {
  const formattedCode = data.code.trim().toUpperCase();
  const existing = await Coupon.findOne({ code: formattedCode });
  if (existing) {
    throw new AppError(`Coupon code "${formattedCode}" already exists.`, HTTP_STATUS.CONFLICT);
  }

  const coupon = await Coupon.create({
    code: formattedCode,
    discountType: data.discountType,
    discountValue: Number(data.discountValue),
    maxUses: data.maxUses !== undefined ? Number(data.maxUses) : -1,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    isActive: data.isActive !== undefined ? data.isActive : true,
  });

  return coupon;
};

/**
 * Toggle Coupon Active Status
 */
export const toggleAdminCoupon = async (couponId: string) => {
  const coupon = await Coupon.findById(couponId);
  if (!coupon) {
    throw new AppError("Coupon not found.", HTTP_STATUS.NOT_FOUND);
  }

  coupon.isActive = !coupon.isActive;
  await coupon.save();
  return coupon;
};

/**
 * Manually Grant / Override User Subscription
 */
export const overrideUserSubscription = async (
  userId: string,
  planCode: string,
  durationDays: number = 30,
  reason: string = "Admin Manual Grant"
) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new AppError("Target user not found.", HTTP_STATUS.NOT_FOUND);
  }

  const plan = await SubscriptionPlan.findOne({ code: planCode });
  if (!plan) {
    throw new AppError(`Plan with code "${planCode}" does not exist.`, HTTP_STATUS.NOT_FOUND);
  }

  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + Number(durationDays));

  // Cancel prior active subscriptions
  await Subscription.updateMany(
    { userId, status: "active" },
    { $set: { status: "canceled", cancelAtPeriodEnd: false } }
  );

  const newSub = await Subscription.create({
    userId,
    planId: plan._id,
    planCode: plan.code,
    status: "active",
    billingType: "one_time",
    currentPeriodStart: startDate,
    currentPeriodEnd: endDate,
    cancelAtPeriodEnd: false,
    provider: "internal",
    usages: { jobsPostedCount: 0, featuredJobsCount: 0, inmailCreditsUsed: 0 },
  });

  // Create audit transaction record
  await PaymentTransaction.create({
    userId,
    subscriptionId: newSub._id,
    planId: plan._id,
    amount: 0,
    currency: plan.currency,
    provider: "internal",
    transactionId: `admin_override_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    status: "succeeded",
    type: "checkout",
    paymentMethod: "admin_grant",
    paidAt: new Date(),
    invoiceUrl: `https://jobsbox.com/invoices/admin_grant_${Date.now()}.pdf`,
    metadata: {
      grantedBy: "Admin",
      reason,
      planName: plan.name,
      durationDays,
    },
  });

  return await newSub.populate("planId");
};