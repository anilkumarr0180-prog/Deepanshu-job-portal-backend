const fs = require('fs');
const path = require('path');

const clientRoot = path.resolve(__dirname, '../../client/src');
console.log('Target Client Root:', clientRoot);

// 1. Create client/src/features/admin/api/admin-finance.api.ts
const apiFilePath = path.join(clientRoot, 'features/admin/api/admin-finance.api.ts');
const apiContent = `import { axiosInstance } from "@/lib/axios";

export interface FinanceKPI {
  totalGross: number;
  mrr: number;
  activePaidSubscriptions: number;
  avgOrderValue: number;
  totalTransactions: number;
  succeededTransactions: number;
  failedTransactions: number;
  successRate: number;
}

export interface DailyRevenuePoint {
  date: string;
  revenue: number;
  transactions: number;
}

export interface AdminTransaction {
  _id: string;
  transactionId: string;
  provider: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  amount: number;
  currency: string;
  status: "succeeded" | "failed" | "pending" | "refunded";
  type: string;
  paymentMethod: string;
  paidAt?: string;
  createdAt: string;
  invoiceUrl?: string;
  userId?: {
    _id: string;
    name: string;
    email: string;
    role: string;
  };
  planId?: {
    _id: string;
    name: string;
    code: string;
    price: number;
    billingPeriod: string;
  };
  metadata?: Record<string, any>;
}

export interface AdminSubscriptionPlan {
  _id: string;
  code: string;
  name: string;
  description: string;
  targetRole: "candidate" | "recruiter";
  price: number;
  currency: string;
  billingPeriod: "monthly" | "yearly";
  features: {
    jobLimit?: number;
    featuredJobLimit?: number;
    inmailCredits?: number;
    topApplicantBadge?: boolean;
    prioritySupport?: boolean;
    analyticsLevel?: string;
    candidateSearchAccess?: boolean;
    savedJobsLimit?: number;
    [key: string]: any;
  };
  provider: string;
  providerPlanId?: string;
  isActive: boolean;
  isPopular?: boolean;
  createdAt: string;
}

export interface AdminCoupon {
  _id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxUses: number;
  timesUsed: number;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
}

export interface FinanceOverviewResponse {
  kpi: FinanceKPI;
  thirtyDayTimeSeries: DailyRevenuePoint[];
  recentTransactions: AdminTransaction[];
}

export interface TransactionsResponse {
  items: AdminTransaction[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export const fetchFinanceOverview = async (): Promise<FinanceOverviewResponse> => {
  const response = await axiosInstance.get("/admin/finance/overview");
  return response.data.data;
};

export const fetchAdminTransactions = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  provider?: string;
  startDate?: string;
  endDate?: string;
  sort?: string;
}): Promise<TransactionsResponse> => {
  const response = await axiosInstance.get("/admin/finance/transactions", { params });
  return response.data.data;
};

export const fetchAdminPlans = async (): Promise<AdminSubscriptionPlan[]> => {
  const response = await axiosInstance.get("/admin/finance/plans");
  return response.data.data;
};

export const createAdminPlan = async (
  payload: Partial<AdminSubscriptionPlan>
): Promise<AdminSubscriptionPlan> => {
  const response = await axiosInstance.post("/admin/finance/plans", payload);
  return response.data.data;
};

export const updateAdminPlan = async (
  planId: string,
  payload: Partial<AdminSubscriptionPlan>
): Promise<AdminSubscriptionPlan> => {
  const response = await axiosInstance.put(\`/admin/finance/plans/\${planId}\`, payload);
  return response.data.data;
};

export const fetchAdminCoupons = async (): Promise<AdminCoupon[]> => {
  const response = await axiosInstance.get("/admin/finance/coupons");
  return response.data.data;
};

export const createAdminCoupon = async (payload: {
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxUses?: number;
  expiresAt?: string;
  isActive?: boolean;
}): Promise<AdminCoupon> => {
  const response = await axiosInstance.post("/admin/finance/coupons", payload);
  return response.data.data;
};

export const toggleAdminCoupon = async (couponId: string): Promise<AdminCoupon> => {
  const response = await axiosInstance.patch(\`/admin/finance/coupons/\${couponId}/toggle\`);
  return response.data.data;
};

export const overrideUserSubscription = async (payload: {
  userId: string;
  planCode: string;
  durationDays: number;
  reason?: string;
}) => {
  const response = await axiosInstance.post("/admin/finance/subscriptions/override", payload);
  return response.data.data;
};
`;

fs.mkdirSync(path.dirname(apiFilePath), { recursive: true });
fs.writeFileSync(apiFilePath, apiContent, 'utf8');
console.log('Wrote:', apiFilePath);

// 2. Create client/src/features/admin/pages/AdminFinancePage.tsx
const pageFilePath = path.join(clientRoot, 'features/admin/pages/AdminFinancePage.tsx');
const pageContent = `import { useState, useEffect } from "react";
import {
  TrendingUp,
  CreditCard,
  Layers,
  Tag,
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Plus,
  RefreshCw,
  Clock,
  Sparkles,
} from "lucide-react";
import toast from "react-hot-toast";
import {
  fetchFinanceOverview,
  fetchAdminTransactions,
  fetchAdminPlans,
  updateAdminPlan,
  createAdminPlan,
  fetchAdminCoupons,
  createAdminCoupon,
  toggleAdminCoupon,
  overrideUserSubscription,
  type FinanceOverviewResponse,
  type AdminTransaction,
  type AdminSubscriptionPlan,
  type AdminCoupon,
} from "../api/admin-finance.api";

type FinanceTab = "overview" | "transactions" | "plans" | "coupons" | "override";

export default function AdminFinancePage() {
  const [activeTab, setActiveTab] = useState<FinanceTab>("overview");
  const [isLoading, setIsLoading] = useState(false);

  // Overview State
  const [overview, setOverview] = useState<FinanceOverviewResponse | null>(null);

  // Transactions State
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txTotalPages, setTxTotalPages] = useState(1);
  const [txSearch, setTxSearch] = useState("");
  const [txStatus, setTxStatus] = useState("All");
  const [txProvider, setTxProvider] = useState("All");

  // Plans State
  const [plans, setPlans] = useState<AdminSubscriptionPlan[]>([]);
  const [editingPlan, setEditingPlan] = useState<AdminSubscriptionPlan | null>(null);
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [planForm, setPlanForm] = useState({
    code: "",
    name: "",
    description: "",
    targetRole: "recruiter" as "recruiter" | "candidate",
    price: 0,
    currency: "INR",
    billingPeriod: "monthly" as "monthly" | "yearly",
    jobLimit: 5,
    featuredJobLimit: 1,
    inmailCredits: 10,
    isActive: true,
    isPopular: false,
  });

  // Coupons State
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [isCreatingCoupon, setIsCreatingCoupon] = useState(false);
  const [couponForm, setCouponForm] = useState({
    code: "",
    discountType: "percentage" as "percentage" | "fixed",
    discountValue: 20,
    maxUses: -1,
    expiresAt: "",
  });

  // Override State
  const [overrideUserId, setOverrideUserId] = useState("");
  const [overridePlanCode, setOverridePlanCode] = useState("recruiter_lite");
  const [overrideDays, setOverrideDays] = useState(30);
  const [overrideReason, setOverrideReason] = useState("Complimentary Support / Partner Plan");
  const [isSubmittingOverride, setIsSubmittingOverride] = useState(false);

  // Load Data by Tab
  const loadOverview = async () => {
    setIsLoading(true);
    try {
      const data = await fetchFinanceOverview();
      setOverview(data);
    } catch (err: any) {
      toast.error("Failed to load financial metrics.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadTransactions = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminTransactions({
        page: txPage,
        limit: 10,
        search: txSearch || undefined,
        status: txStatus !== "All" ? txStatus.toLowerCase() : undefined,
        provider: txProvider !== "All" ? txProvider.toLowerCase() : undefined,
      });
      setTransactions(data.items);
      setTxTotalPages(data.pagination.totalPages || 1);
    } catch (err: any) {
      toast.error("Failed to load transactions.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadPlans = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminPlans();
      setPlans(data);
    } catch (err: any) {
      toast.error("Failed to load subscription plans.");
    } finally {
      setIsLoading(false);
    }
  };

  const loadCoupons = async () => {
    setIsLoading(true);
    try {
      const data = await fetchAdminCoupons();
      setCoupons(data);
    } catch (err: any) {
      toast.error("Failed to load coupons.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "overview") loadOverview();
    if (activeTab === "transactions") loadTransactions();
    if (activeTab === "plans") loadPlans();
    if (activeTab === "coupons") loadCoupons();
  }, [activeTab, txPage, txStatus, txProvider]);

  // Plan Edit / Save Handlers
  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingPlan) {
        await updateAdminPlan(editingPlan._id, {
          name: planForm.name,
          description: planForm.description,
          price: Number(planForm.price),
          billingPeriod: planForm.billingPeriod,
          isActive: planForm.isActive,
          isPopular: planForm.isPopular,
          features: {
            jobLimit: Number(planForm.jobLimit),
            featuredJobLimit: Number(planForm.featuredJobLimit),
            inmailCredits: Number(planForm.inmailCredits),
          },
        });
        toast.success("Plan updated successfully!");
      } else {
        await createAdminPlan({
          code: planForm.code,
          name: planForm.name,
          description: planForm.description,
          targetRole: planForm.targetRole,
          price: Number(planForm.price),
          currency: planForm.currency,
          billingPeriod: planForm.billingPeriod,
          isActive: planForm.isActive,
          isPopular: planForm.isPopular,
          features: {
            jobLimit: Number(planForm.jobLimit),
            featuredJobLimit: Number(planForm.featuredJobLimit),
            inmailCredits: Number(planForm.inmailCredits),
          },
        });
        toast.success("New subscription plan created!");
      }
      setEditingPlan(null);
      setIsCreatingPlan(false);
      loadPlans();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to save plan.");
    }
  };

  // Coupon Creation Handler
  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createAdminCoupon({
        code: couponForm.code,
        discountType: couponForm.discountType,
        discountValue: Number(couponForm.discountValue),
        maxUses: Number(couponForm.maxUses),
        expiresAt: couponForm.expiresAt || undefined,
      });
      toast.success("Coupon code generated successfully!");
      setIsCreatingCoupon(false);
      setCouponForm({ code: "", discountType: "percentage", discountValue: 20, maxUses: -1, expiresAt: "" });
      loadCoupons();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to create coupon.");
    }
  };

  // Coupon Toggle
  const handleToggleCoupon = async (id: string) => {
    try {
      await toggleAdminCoupon(id);
      toast.success("Coupon status updated!");
      loadCoupons();
    } catch (err: any) {
      toast.error("Failed to toggle coupon.");
    }
  };

  // Override Handler
  const handleOverrideSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideUserId) {
      toast.error("Please enter a valid User ID.");
      return;
    }
    setIsSubmittingOverride(true);
    try {
      await overrideUserSubscription({
        userId: overrideUserId.trim(),
        planCode: overridePlanCode,
        durationDays: Number(overrideDays),
        reason: overrideReason,
      });
      toast.success("Subscription granted successfully to user!");
      setOverrideUserId("");
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to override subscription.");
    } finally {
      setIsSubmittingOverride(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700 mb-2">
              <ShieldCheck className="w-4 h-4" />
              <span>Razorpay & Enterprise Billing Hub</span>
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Financial & Subscriptions Command Center</h2>
            <p className="mt-1 text-sm text-slate-500">
              Monitor gross transaction volumes, inspect live payment ledgers, adjust plan limits, and manage discount promo codes.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (activeTab === "overview") loadOverview();
              if (activeTab === "transactions") loadTransactions();
              if (activeTab === "plans") loadPlans();
              if (activeTab === "coupons") loadCoupons();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Sync Real-Time Data</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          { id: "overview", label: "Overview & Analytics", icon: TrendingUp },
          { id: "transactions", label: "Transactions Ledger", icon: CreditCard },
          { id: "plans", label: "Plans & Limits Editor", icon: Layers },
          { id: "coupons", label: "Promo Codes & Discounts", icon: Tag },
          { id: "override", label: "Manual Subscription Grant", icon: ShieldCheck },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id as FinanceTab)}
              className={\`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition \${
                isActive
                  ? "bg-[#3C65F5] text-white shadow-md shadow-blue-500/20"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }\`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {isLoading && !overview ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 bg-slate-200 rounded-2xl"></div>
              ))}
            </div>
          ) : (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Gross Volume</span>
                  <div className="mt-2 text-2xl font-black text-slate-900">
                    ₹{overview?.kpi.totalGross.toLocaleString("en-IN") || 0}
                  </div>
                  <span className="text-xs font-semibold text-emerald-600">All successful platform checkouts</span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Estimated MRR</span>
                  <div className="mt-2 text-2xl font-black text-indigo-600">
                    ₹{overview?.kpi.mrr.toLocaleString("en-IN") || 0}
                    <span className="text-xs font-medium text-slate-400">/mo</span>
                  </div>
                  <span className="text-xs font-semibold text-slate-500">From active recurring & monthly tiers</span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Active Paid Subscriptions</span>
                  <div className="mt-2 text-2xl font-black text-slate-900">
                    {overview?.kpi.activePaidSubscriptions || 0}
                  </div>
                  <span className="text-xs font-semibold text-indigo-600">Recruiters & Pro Candidates</span>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Gateway Success Rate</span>
                  <div className="mt-2 text-2xl font-black text-emerald-600">
                    {overview?.kpi.successRate || 100}%
                  </div>
                  <span className="text-xs font-semibold text-slate-500">
                    {overview?.kpi.succeededTransactions || 0} / {overview?.kpi.totalTransactions || 0} transactions
                  </span>
                </div>
              </div>

              {/* 30-Day Revenue Trend */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 mb-4">30-Day Daily Revenue Velocity</h3>
                {overview?.thirtyDayTimeSeries.length === 0 ? (
                  <div className="py-12 text-center text-sm text-slate-400">
                    No transactions captured in the last 30 days.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                      {overview?.thirtyDayTimeSeries.map((point) => (
                        <div key={point.date} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-center">
                          <span className="text-[11px] font-bold text-slate-500">{point.date.slice(5)}</span>
                          <div className="mt-1 text-sm font-black text-slate-900">₹{point.revenue.toLocaleString("en-IN")}</div>
                          <span className="text-[10px] text-slate-400">{point.transactions} txn</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Recent Transactions Snippet */}
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-bold text-slate-900">Latest Payment Receipts</h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("transactions")}
                    className="text-xs font-bold text-indigo-600 hover:underline"
                  >
                    View All Ledgers →
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-bold uppercase text-slate-400">
                        <th className="pb-3">Transaction ID</th>
                        <th className="pb-3">User</th>
                        <th className="pb-3">Plan</th>
                        <th className="pb-3">Amount</th>
                        <th className="pb-3">Status</th>
                        <th className="pb-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {overview?.recentTransactions.map((tx) => (
                        <tr key={tx._id} className="hover:bg-slate-50/60">
                          <td className="py-3 font-mono text-xs text-slate-600">{tx.transactionId}</td>
                          <td className="py-3 font-medium text-slate-900">
                            {tx.userId?.name || "Anonymous User"}
                            <span className="block text-xs text-slate-400 font-normal">{tx.userId?.email}</span>
                          </td>
                          <td className="py-3 font-medium text-slate-800">{tx.planId?.name || "Custom Plan"}</td>
                          <td className="py-3 font-bold text-slate-900">₹{tx.amount.toLocaleString("en-IN")}</td>
                          <td className="py-3">
                            <span
                              className={\`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold \${
                                tx.status === "succeeded"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : tx.status === "failed"
                                  ? "bg-red-50 text-red-700"
                                  : "bg-amber-50 text-amber-700"
                              }\`}
                            >
                              {tx.status === "succeeded" ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : (
                                <XCircle className="w-3 h-3" />
                              )}
                              {tx.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="py-3 text-xs text-slate-500">
                            {new Date(tx.paidAt || tx.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: TRANSACTIONS */}
      {activeTab === "transactions" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Payment ID, Order ID, or User Email..."
                value={txSearch}
                onChange={(e) => {
                  setTxSearch(e.target.value);
                  setTxPage(1);
                }}
                onKeyDown={(e) => e.key === "Enter" && loadTransactions()}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">Status:</span>
              <select
                value={txStatus}
                onChange={(e) => {
                  setTxStatus(e.target.value);
                  setTxPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                <option value="All">All Statuses</option>
                <option value="succeeded">Succeeded</option>
                <option value="failed">Failed</option>
                <option value="pending">Pending</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">Provider:</span>
              <select
                value={txProvider}
                onChange={(e) => {
                  setTxProvider(e.target.value);
                  setTxPage(1);
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700"
              >
                <option value="All">All Gateways</option>
                <option value="razorpay">Razorpay</option>
                <option value="stripe">Stripe</option>
                <option value="internal">Internal / Admin</option>
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50/80 border-b border-slate-200 text-xs font-bold uppercase text-slate-400">
                  <tr>
                    <th className="p-4">Transaction / Order ID</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4">Plan Code</th>
                    <th className="p-4">Amount</th>
                    <th className="p-4">Gateway</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        No transactions found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <tr key={tx._id} className="hover:bg-slate-50/60">
                        <td className="p-4">
                          <span className="font-mono text-xs font-bold text-slate-700 block">{tx.transactionId}</span>
                          {tx.providerOrderId && (
                            <span className="font-mono text-[11px] text-slate-400 block">{tx.providerOrderId}</span>
                          )}
                        </td>
                        <td className="p-4">
                          <span className="font-semibold text-slate-900 block">{tx.userId?.name || "Deleted User"}</span>
                          <span className="text-xs text-slate-500 font-normal">{tx.userId?.email}</span>
                        </td>
                        <td className="p-4">
                          <span className="font-medium text-slate-800">{tx.planId?.name || "Custom Plan"}</span>
                          <span className="block text-xs font-mono text-slate-400">{tx.planId?.code}</span>
                        </td>
                        <td className="p-4 font-black text-slate-900">₹{tx.amount.toLocaleString("en-IN")}</td>
                        <td className="p-4">
                          <span className="capitalize text-xs font-semibold text-slate-600">{tx.provider}</span>
                          <span className="block text-[10px] text-slate-400 uppercase">{tx.paymentMethod}</span>
                        </td>
                        <td className="p-4">
                          <span
                            className={\`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold \${
                              tx.status === "succeeded"
                                ? "bg-emerald-50 text-emerald-700"
                                : tx.status === "failed"
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                            }\`}
                          >
                            {tx.status === "succeeded" ? (
                              <CheckCircle2 className="w-3 h-3" />
                            ) : (
                              <XCircle className="w-3 h-3" />
                            )}
                            {tx.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-4 text-xs text-slate-500">
                          {new Date(tx.paidAt || tx.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between border-t border-slate-200 p-4 bg-slate-50/50">
              <span className="text-xs text-slate-500">
                Page {txPage} of {txTotalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={txPage <= 1}
                  onClick={() => setTxPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={txPage >= txTotalPages}
                  onClick={() => setTxPage((p) => p + 1)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PLANS & LIMITS */}
      {activeTab === "plans" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Configured Subscription Plans</h3>
            <button
              type="button"
              onClick={() => {
                setEditingPlan(null);
                setPlanForm({
                  code: "",
                  name: "",
                  description: "",
                  targetRole: "recruiter",
                  price: 999,
                  currency: "INR",
                  billingPeriod: "monthly",
                  jobLimit: 10,
                  featuredJobLimit: 2,
                  inmailCredits: 20,
                  isActive: true,
                  isPopular: false,
                });
                setIsCreatingPlan(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Plan</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan._id}
                className={\`rounded-2xl border bg-white p-6 shadow-sm flex flex-col justify-between \${
                  plan.isPopular ? "border-indigo-500 ring-2 ring-indigo-500/20" : "border-slate-200"
                }\`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">
                      {plan.targetRole} Tier
                    </span>
                    {plan.isPopular && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-800">
                        <Sparkles className="w-3 h-3" />
                        POPULAR
                      </span>
                    )}
                  </div>
                  <h4 className="text-xl font-black text-slate-900">{plan.name}</h4>
                  <p className="text-xs text-slate-500 mt-1">{plan.description}</p>

                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-slate-900">₹{plan.price.toLocaleString("en-IN")}</span>
                    <span className="text-xs font-medium text-slate-500">/{plan.billingPeriod}</span>
                  </div>

                  <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Job Posting Limit:</span>
                      <span className="font-bold text-slate-800">
                        {plan.features?.jobLimit === -1 ? "Unlimited" : plan.features?.jobLimit ?? "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Featured Job Boosts:</span>
                      <span className="font-bold text-slate-800">{plan.features?.featuredJobLimit ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">InMail Direct Credits:</span>
                      <span className="font-bold text-slate-800">
                        {plan.features?.inmailCredits === -1 ? "Unlimited" : plan.features?.inmailCredits ?? 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Status:</span>
                      <span
                        className={\`font-bold \${plan.isActive ? "text-emerald-600" : "text-rose-600"}\`}
                      >
                        {plan.isActive ? "Active in Store" : "Disabled / Hidden"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPlan(plan);
                      setPlanForm({
                        code: plan.code,
                        name: plan.name,
                        description: plan.description,
                        targetRole: plan.targetRole,
                        price: plan.price,
                        currency: plan.currency,
                        billingPeriod: plan.billingPeriod,
                        jobLimit: plan.features?.jobLimit ?? 5,
                        featuredJobLimit: plan.features?.featuredJobLimit ?? 0,
                        inmailCredits: plan.features?.inmailCredits ?? 0,
                        isActive: plan.isActive,
                        isPopular: plan.isPopular ?? false,
                      });
                      setIsCreatingPlan(true);
                    }}
                    className="w-full py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-800 transition"
                  >
                    Edit Pricing & Features
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Modal: Create/Edit Plan */}
          {isCreatingPlan && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b pb-3">
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingPlan ? \`Edit Plan (\${editingPlan.name})\` : "Create New Subscription Plan"}
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsCreatingPlan(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSavePlan} className="space-y-4">
                  {!editingPlan && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Plan Code (Unique Identifier)</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. recruiter_platinum"
                        value={planForm.code}
                        onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 text-sm focus:border-indigo-500"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Plan Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Recruiter Premium"
                      value={planForm.name}
                      onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 text-sm focus:border-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Description</label>
                    <textarea
                      required
                      placeholder="Plan benefits description..."
                      value={planForm.description}
                      onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 text-sm focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Price (INR)</label>
                      <input
                        type="number"
                        min="0"
                        required
                        value={planForm.price}
                        onChange={(e) => setPlanForm({ ...planForm, price: Number(e.target.value) })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 text-sm focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Billing Period</label>
                      <select
                        value={planForm.billingPeriod}
                        onChange={(e) => setPlanForm({ ...planForm, billingPeriod: e.target.value as any })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 text-sm"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Job Limit (-1 unlim)</label>
                      <input
                        type="number"
                        value={planForm.jobLimit}
                        onChange={(e) => setPlanForm({ ...planForm, jobLimit: Number(e.target.value) })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Featured Jobs</label>
                      <input
                        type="number"
                        value={planForm.featuredJobLimit}
                        onChange={(e) => setPlanForm({ ...planForm, featuredJobLimit: Number(e.target.value) })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">InMail Credits</label>
                      <input
                        type="number"
                        value={planForm.inmailCredits}
                        onChange={(e) => setPlanForm({ ...planForm, inmailCredits: Number(e.target.value) })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-6 pt-2">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={planForm.isActive}
                        onChange={(e) => setPlanForm({ ...planForm, isActive: e.target.checked })}
                        className="rounded"
                      />
                      Active in Store
                    </label>

                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <input
                        type="checkbox"
                        checked={planForm.isPopular}
                        onChange={(e) => setPlanForm({ ...planForm, isPopular: e.target.checked })}
                        className="rounded"
                      />
                      Highlight as Popular
                    </label>
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <button
                      type="button"
                      onClick={() => setIsCreatingPlan(false)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700"
                    >
                      Save Plan
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: COUPONS & DISCOUNTS */}
      {activeTab === "coupons" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Discount & Promo Codes</h3>
            <button
              type="button"
              onClick={() => setIsCreatingCoupon(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-indigo-600/20 hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4" />
              <span>Create Promo Code</span>
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase text-slate-400">
                <tr>
                  <th className="p-4">Coupon Code</th>
                  <th className="p-4">Discount</th>
                  <th className="p-4">Redemptions</th>
                  <th className="p-4">Expiration</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {coupons.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      No discount coupons created yet. Click "Create Promo Code" to get started.
                    </td>
                  </tr>
                ) : (
                  coupons.map((c) => (
                    <tr key={c._id} className="hover:bg-slate-50/60">
                      <td className="p-4">
                        <span className="font-mono text-sm font-black text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
                          {c.code}
                        </span>
                      </td>
                      <td className="p-4 font-bold text-slate-900">
                        {c.discountType === "percentage" ? \`\${c.discountValue}% OFF\` : \`₹\${c.discountValue} OFF\`}
                      </td>
                      <td className="p-4 text-xs font-semibold text-slate-700">
                        {c.timesUsed} used {c.maxUses !== -1 && \`/ \${c.maxUses} max\`}
                      </td>
                      <td className="p-4 text-xs text-slate-500">
                        {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : "Never Expires"}
                      </td>
                      <td className="p-4">
                        <span
                          className={\`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold \${
                            c.isActive ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }\`}
                        >
                          {c.isActive ? "ACTIVE" : "DISABLED"}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleCoupon(c._id)}
                          className="text-xs font-bold text-indigo-600 hover:underline"
                        >
                          {c.isActive ? "Disable" : "Enable"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Modal: Create Coupon */}
          {isCreatingCoupon && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
                <div className="flex items-center justify-between border-b pb-3">
                  <h3 className="text-lg font-bold text-slate-900">Generate Promo Code</h3>
                  <button type="button" onClick={() => setIsCreatingCoupon(false)} className="text-slate-400">
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateCoupon} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Coupon Code</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. LAUNCH50"
                      value={couponForm.code}
                      onChange={(e) => setCouponForm({ ...couponForm, code: e.target.value.toUpperCase() })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Discount Type</label>
                      <select
                        value={couponForm.discountType}
                        onChange={(e) => setCouponForm({ ...couponForm, discountType: e.target.value as any })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 text-sm"
                      >
                        <option value="percentage">Percentage (%)</option>
                        <option value="fixed">Fixed Amount (₹)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Discount Value</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={couponForm.discountValue}
                        onChange={(e) => setCouponForm({ ...couponForm, discountValue: Number(e.target.value) })}
                        className="w-full p-2.5 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Max Redemptions (-1 unlim)</label>
                    <input
                      type="number"
                      value={couponForm.maxUses}
                      onChange={(e) => setCouponForm({ ...couponForm, maxUses: Number(e.target.value) })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Expiration Date (Optional)</label>
                    <input
                      type="date"
                      value={couponForm.expiresAt}
                      onChange={(e) => setCouponForm({ ...couponForm, expiresAt: e.target.value })}
                      className="w-full p-2.5 rounded-xl border border-slate-200 text-sm"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <button
                      type="button"
                      onClick={() => setIsCreatingCoupon(false)}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-bold text-white hover:bg-indigo-700"
                    >
                      Create Coupon
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: MANUAL SUBSCRIPTION GRANT */}
      {activeTab === "override" && (
        <div className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Manually Grant / Upgrade User Subscription</h3>
            <p className="text-xs text-slate-500 mt-1">
              Directly activate any plan for a recruiter or candidate without charging their payment card. An internal audit transaction will be recorded.
            </p>
          </div>

          <form onSubmit={handleOverrideSubscription} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Target User ID</label>
              <input
                type="text"
                required
                placeholder="Paste MongoDB User ID (e.g. 64a8b...)"
                value={overrideUserId}
                onChange={(e) => setOverrideUserId(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Plan Code</label>
                <select
                  value={overridePlanCode}
                  onChange={(e) => setOverridePlanCode(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-sm"
                >
                  <option value="recruiter_lite">Recruiter Lite (₹999/mo)</option>
                  <option value="recruiter_enterprise">Recruiter Enterprise (₹3,499/mo)</option>
                  <option value="candidate_pro">Candidate Career Pro (₹499/mo)</option>
                  <option value="candidate_premium">Candidate Premium (₹1,299/mo)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Duration (Days)</label>
                <input
                  type="number"
                  min="1"
                  max="3650"
                  required
                  value={overrideDays}
                  onChange={(e) => setOverrideDays(Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-200 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Internal Grant Reason / Note</label>
              <input
                type="text"
                required
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 text-sm"
              />
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmittingOverride}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-600/20 disabled:opacity-50"
              >
                {isSubmittingOverride ? "Granting Plan..." : "Grant Active Subscription"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
`;

fs.writeFileSync(pageFilePath, pageContent, 'utf8');
console.log('Wrote:', pageFilePath);

// 3. Update dashboardConfig.ts
const dashConfigPath = path.join(clientRoot, 'shared/layouts/DashboardLayout/dashboardConfig.ts');
let dashConfigContent = fs.readFileSync(dashConfigPath, 'utf8');
if (!dashConfigContent.includes('/admin/finance')) {
  dashConfigContent = dashConfigContent.replace(
    '      { label: "Jobs", to: "/admin/jobs", icon: BriefcaseBusiness },',
    '      { label: "Jobs", to: "/admin/jobs", icon: BriefcaseBusiness },\\n      { label: "Finance & Billing", to: "/admin/finance", icon: CreditCard },'
  );
  fs.writeFileSync(dashConfigPath, dashConfigContent, 'utf8');
  console.log('Updated:', dashConfigPath);
}

// 4. Update routes.tsx
const routesPath = path.join(clientRoot, 'app/router/routes.tsx');
let routesContent = fs.readFileSync(routesPath, 'utf8');
if (!routesContent.includes('AdminFinancePage')) {
  routesContent = routesContent.replace(
    'import AdminJobsPage from "@/features/admin/pages/AdminJobsPage";',
    'import AdminJobsPage from "@/features/admin/pages/AdminJobsPage";\\nimport AdminFinancePage from "@/features/admin/pages/AdminFinancePage";'
  );
  routesContent = routesContent.replace(
    '        path: "jobs",\\n        element: <AdminJobsPage />,\\n      },',
    '        path: "jobs",\\n        element: <AdminJobsPage />,\\n      },\\n      {\\n        path: "finance",\\n        element: <AdminFinancePage />,\\n      },'
  );
  fs.writeFileSync(routesPath, routesContent, 'utf8');
  console.log('Updated:', routesPath);
}

console.log('All admin finance frontend artifacts created successfully!');
