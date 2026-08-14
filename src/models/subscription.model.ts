import { Schema, model, Document, Types } from "mongoose";

export interface ISubscription extends Document {
  userId: Types.ObjectId;
  planId: Types.ObjectId;
  planCode: string; // Alias snapshot for planCodeSnapshot
  status: "active" | "canceled" | "past_due" | "expired";
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  provider: "internal" | "stripe" | "razorpay" | "mock";
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  usages: {
    jobsPostedCount: number;
    featuredJobsCount: number;
    inmailCreditsUsed: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

const subscriptionSchema = new Schema<ISubscription>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
      required: true,
    },
    planCode: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "canceled", "past_due", "expired"],
      default: "active",
      index: true,
    },
    currentPeriodStart: {
      type: Date,
      required: true,
      default: Date.now,
    },
    currentPeriodEnd: {
      type: Date,
      required: true,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: false,
    },
    provider: {
      type: String,
      enum: ["internal", "stripe", "razorpay", "mock"],
      default: "internal",
    },
    providerSubscriptionId: {
      type: String,
      sparse: true,
      index: true,
    },
    providerCustomerId: {
      type: String,
      sparse: true,
    },
    usages: {
      jobsPostedCount: { type: Number, default: 0 },
      featuredJobsCount: { type: Number, default: 0 },
      inmailCreditsUsed: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

subscriptionSchema.index({ userId: 1, status: 1 });

const Subscription = model<ISubscription>("Subscription", subscriptionSchema);

export default Subscription;
