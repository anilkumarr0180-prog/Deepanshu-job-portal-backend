import { z } from "zod";
import { Types } from "mongoose";

// Helper to validate Mongoose ObjectId
const objectIdSchema = z.string().refine((val) => Types.ObjectId.isValid(val), {
  message: "Invalid ID format. Must be a valid 24-character hexadecimal ObjectId.",
});

export const checkoutSchema = z.object({
  body: z.object({
    planCode: z
      .string()
      .trim()
      .min(1, "planCode is required.")
      .max(100, "planCode cannot exceed 100 characters."),
    paymentMethod: z
      .string()
      .trim()
      .max(50, "paymentMethod cannot exceed 50 characters.")
      .optional()
      .default("card"),
    couponCode: z
      .string()
      .trim()
      .max(50, "couponCode cannot exceed 50 characters.")
      .optional()
      .nullable(),
  }),
});

export const createRazorpayOrderSchema = z.object({
  body: z.object({
    planCode: z
      .string()
      .trim()
      .min(1, "planCode is required.")
      .max(100, "planCode cannot exceed 100 characters."),
    couponCode: z
      .string()
      .trim()
      .max(50, "couponCode cannot exceed 50 characters.")
      .optional()
      .nullable(),
  }),
});

export const verifyRazorpayPaymentSchema = z.object({
  body: z.object({
    orderId: z
      .string()
      .trim()
      .max(100, "orderId cannot exceed 100 characters.")
      .optional()
      .nullable(),
    paymentId: z
      .string()
      .trim()
      .min(1, "paymentId is required.")
      .max(100, "paymentId cannot exceed 100 characters."),
    signature: z
      .string()
      .trim()
      .min(1, "signature is required.")
      .max(200, "signature cannot exceed 200 characters."),
    planCode: z
      .string()
      .trim()
      .max(100, "planCode cannot exceed 100 characters.")
      .optional()
      .nullable(),
    couponCode: z
      .string()
      .trim()
      .max(50, "couponCode cannot exceed 50 characters.")
      .optional()
      .nullable(),
    subscriptionId: z
      .string()
      .trim()
      .max(100, "subscriptionId cannot exceed 100 characters.")
      .optional()
      .nullable(),
  }),
});

export const createPolarCheckoutSchema = z.object({
  body: z.object({
    planCode: z
      .string()
      .trim()
      .min(1, "planCode is required.")
      .max(100, "planCode cannot exceed 100 characters."),
    couponCode: z
      .string()
      .trim()
      .max(50, "couponCode cannot exceed 50 characters.")
      .optional()
      .nullable(),
    successUrl: z
      .string()
      .trim()
      .url("successUrl must be a valid URL.")
      .max(500, "successUrl cannot exceed 500 characters.")
      .optional()
      .nullable(),
  }),
});

export const verifyPolarPaymentSchema = z.object({
  body: z.object({
    checkoutId: z
      .string()
      .trim()
      .min(1, "checkoutId is required.")
      .max(100, "checkoutId cannot exceed 100 characters."),
    planCode: z
      .string()
      .trim()
      .max(100, "planCode cannot exceed 100 characters.")
      .optional()
      .nullable(),
    couponCode: z
      .string()
      .trim()
      .max(50, "couponCode cannot exceed 50 characters.")
      .optional()
      .nullable(),
  }),
});

export const validateCouponSchema = z.object({
  body: z.object({
    code: z
      .string()
      .trim()
      .min(1, "Coupon code is required.")
      .max(50, "Coupon code cannot exceed 50 characters."),
  }),
});

export const boostJobSchema = z.object({
  body: z.object({
    jobId: objectIdSchema,
  }),
});
