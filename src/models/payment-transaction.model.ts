import { Schema, model, Document, Types } from "mongoose";

export interface IPaymentTransaction extends Document {
  userId: Types.ObjectId;
  subscriptionId?: Types.ObjectId;
  planId?: Types.ObjectId;
  amount: number;
  currency: string;
  provider: "mock" | "stripe" | "razorpay";
  transactionId: string;
  status: "succeeded" | "failed" | "pending" | "refunded";
  type: "checkout" | "renewal" | "refund";
  paymentMethod: string;
  invoiceUrl?: string;
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
      default: "USD",
    },
    provider: {
      type: String,
      enum: ["mock", "stripe", "razorpay"],
      default: "mock",
    },
    transactionId: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["succeeded", "failed", "pending", "refunded"],
      default: "succeeded",
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
