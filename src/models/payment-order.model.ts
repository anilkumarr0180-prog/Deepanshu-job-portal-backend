import mongoose, { Schema, Document, Types } from "mongoose";

export interface IPaymentOrder extends Document {
  _id: Types.ObjectId;
  orderId: string;
  userId: Types.ObjectId;
  planCode: string;
  couponCode?: string;
  amount: number; // in paise for Razorpay
  currency: string;
  provider: "razorpay" | "polar";
  status: "created" | "paid" | "failed" | "expired";
  subscriptionId?: string;
  paymentId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentOrderSchema = new Schema<IPaymentOrder>(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    planCode: {
      type: String,
      required: true,
      trim: true,
    },
    couponCode: {
      type: String,
      trim: true,
      default: undefined,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    provider: {
      type: String,
      enum: ["razorpay", "polar"],
      default: "razorpay",
    },
    status: {
      type: String,
      enum: ["created", "paid", "failed", "expired"],
      default: "created",
      index: true,
    },
    subscriptionId: {
      type: String,
      trim: true,
      default: undefined,
    },
    paymentId: {
      type: String,
      trim: true,
      default: undefined,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

PaymentOrderSchema.index({ userId: 1, status: 1 });

const PaymentOrder = mongoose.model<IPaymentOrder>("PaymentOrder", PaymentOrderSchema);

export default PaymentOrder;
