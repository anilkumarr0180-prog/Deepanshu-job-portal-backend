import { Schema, model, Document } from "mongoose";

export interface ISubscriptionPlan extends Document {
  code: string; // 'candidate_free' | 'candidate_pro' | 'candidate_premium' | 'recruiter_free' | 'recruiter_lite' | 'recruiter_enterprise'
  name: string;
  description: string;
  targetRole: "candidate" | "recruiter";
  price: number;
  currency: string;
  billingPeriod: "monthly" | "yearly";
  features: {
    jobLimit?: number; // -1 for unlimited
    featuredJobLimit?: number;
    inmailCredits?: number;
    topApplicantBadge?: boolean;
    prioritySupport?: boolean;
    analyticsLevel?: "basic" | "advanced" | "enterprise";
    candidateSearchAccess?: boolean;
    savedJobsLimit?: number;
  };
  provider: "internal" | "stripe" | "razorpay";
  providerPlanId?: string;
  isActive: boolean;
  isPopular?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    targetRole: {
      type: String,
      enum: ["candidate", "recruiter"],
      required: true,
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
      trim: true,
    },
    billingPeriod: {
      type: String,
      enum: ["monthly", "yearly"],
      default: "monthly",
    },
    features: {
      jobLimit: { type: Number, default: 1 },
      featuredJobLimit: { type: Number, default: 0 },
      inmailCredits: { type: Number, default: 0 },
      topApplicantBadge: { type: Boolean, default: false },
      prioritySupport: { type: Boolean, default: false },
      analyticsLevel: { type: String, enum: ["basic", "advanced", "enterprise"], default: "basic" },
      candidateSearchAccess: { type: Boolean, default: false },
      savedJobsLimit: { type: Number, default: 5 },
    },
    provider: {
      type: String,
      enum: ["internal", "stripe", "razorpay"],
      default: "razorpay",
    },
    providerPlanId: {
      type: String,
      sparse: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

subscriptionPlanSchema.index({ targetRole: 1, isActive: 1 });

const SubscriptionPlan = model<ISubscriptionPlan>(
  "SubscriptionPlan",
  subscriptionPlanSchema
);

export default SubscriptionPlan;
