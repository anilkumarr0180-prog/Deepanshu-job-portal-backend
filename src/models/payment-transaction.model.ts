import { Schema, model, Document, Types } from "mongoose";

export interface IPaymentTransaction extends Document {
  userId: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  planId?: Types.ObjectId;
  amount: number;
  currency: string;
  provider: "internal" | "stripe" | "razorpay" | "polar" | "mock";
  transactionId: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  providerSubscriptionId?: string;
  status: "succeeded" | "failed" | "pending" | "refunded";
  type: "checkout" | "renewal" | "refund";
  paymentMethod: string;
  invoiceUrl?: string;
  paidAt?: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const paymentTransactionSchema = new Schema<IPaymentTransaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subscriptionId: {
      type: Schema.Types.ObjectId,
      ref: "Subscription",
    },
    planId: {
      type: Schema.Types.ObjectId,
      ref: "SubscriptionPlan",
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    provider: {
      type: String,
      enum: ["internal", "stripe", "razorpay", "polar", "mock"],
      default: "razorpay",
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    providerOrderId: {
      type: String,
      sparse: true,
      index: true,
    },
    providerPaymentId: {
      type: String,
      sparse: true,
      index: true,
    },
    providerSubscriptionId: {
      type: String,
      sparse: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["succeeded", "failed", "pending", "refunded"],
      default: "pending",
      index: true,
    },
    type: {
      type: String,
      enum: ["checkout", "renewal", "refund"],
      default: "checkout",
    },
    paymentMethod: {
      type: String,
      default: "card",
    },
    invoiceUrl: {
      type: String,
    },
    paidAt: {
      type: Date,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

paymentTransactionSchema.index({ userId: 1, createdAt: -1 });

const PaymentTransaction = model<IPaymentTransaction>(
  "PaymentTransaction",
  paymentTransactionSchema
);

export default PaymentTransaction;
