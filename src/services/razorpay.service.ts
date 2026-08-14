import crypto from "crypto";
import { env } from "../config/env";

export function getRazorpayCredentials() {
  return {
    keyId: env.RAZORPAY_KEY_ID,
    keySecret: env.RAZORPAY_KEY_SECRET,
    webhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
    isConfigured: Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET),
  };
}

function getAuthHeader(): string {
  const { keyId, keySecret } = getRazorpayCredentials();
  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials (RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET) are missing from environment variables.");
  }
  return "Basic " + Buffer.from(`${keyId}:${keySecret}`).toString("base64");
}

export async function createRazorpayPlan(params: {
  name: string;
  amountInRupees: number;
  currency?: string;
  billingPeriod?: "monthly" | "yearly";
}) {
  const amountInPaise = Math.max(100, Math.round(params.amountInRupees * 100));
  const period = params.billingPeriod === "yearly" ? "yearly" : "monthly";

  const response = await fetch("https://api.razorpay.com/v1/plans", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({
      period,
      interval: 1,
      item: {
        name: params.name,
        amount: amountInPaise,
        currency: params.currency || "INR",
        description: `${params.name} Subscription Plan`,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Razorpay Plan Creation Failed: ${response.status} ${errorText}`);
  }

  const data: any = await response.json();
  return data;
}

export async function createRazorpaySubscription(params: {
  planId: string;
  totalCount?: number;
  customerNotify?: number;
  notes?: Record<string, any>;
}) {
  const response = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({
      plan_id: params.planId,
      total_count: params.totalCount || 120,
      quantity: 1,
      customer_notify: params.customerNotify ?? 1,
      notes: params.notes || {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Razorpay Subscription Creation Failed: ${response.status} ${errorText}`);
  }

  const data: any = await response.json();
  return data;
}

export async function createRazorpayOrder(params: {
  amountInRupees: number;
  currency?: string;
  receipt?: string;
  notes?: Record<string, any>;
}) {
  const amountInPaise = Math.max(100, Math.round(params.amountInRupees * 100));

  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({
      amount: amountInPaise,
      currency: params.currency || "INR",
      receipt: params.receipt || `rcpt_${Date.now()}`,
      notes: params.notes || {},
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Razorpay Order Creation Failed: ${response.status} ${errorText}`);
  }

  const data: any = await response.json();
  return data;
}

export async function fetchRazorpaySubscription(subscriptionId: string) {
  const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}`, {
    method: "GET",
    headers: {
      Authorization: getAuthHeader(),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Razorpay Fetch Subscription Failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}

export async function cancelRazorpaySubscription(subscriptionId: string, cancelAtCycleEnd: boolean = true) {
  const response = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getAuthHeader(),
    },
    body: JSON.stringify({
      cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Razorpay Cancel Subscription Failed: ${response.status} ${errorText}`);
  }

  return await response.json();
}

export function verifyPaymentSignature(params: {
  orderId?: string;
  paymentId: string;
  signature: string;
  subscriptionId?: string;
}): boolean {
  const { keySecret } = getRazorpayCredentials();
  if (!keySecret) {
    throw new Error("Razorpay RAZORPAY_KEY_SECRET is not configured.");
  }

  let textToSign = "";
  const subId = params.subscriptionId || (params.orderId && params.orderId.startsWith("sub_") ? params.orderId : undefined);
  const ordId = params.orderId && params.orderId.startsWith("order_") ? params.orderId : params.orderId;

  if (subId) {
    // Razorpay subscription signature is: payment_id|subscription_id
    textToSign = `${params.paymentId}|${subId}`;
  } else if (ordId) {
    // Razorpay order signature is: order_id|payment_id
    textToSign = `${ordId}|${params.paymentId}`;
  } else {
    throw new Error("Either orderId or subscriptionId must be provided to verify payment signature.");
  }

  const generatedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(textToSign)
    .digest("hex");

  return generatedSignature === params.signature;
}

export function verifyWebhookSignature(rawBody: string | Buffer, signature: string): boolean {
  const { webhookSecret } = getRazorpayCredentials();
  if (!webhookSecret) {
    throw new Error("Razorpay RAZORPAY_WEBHOOK_SECRET is not configured.");
  }

  const expectedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  if (expectedSignature === signature) {
    return true;
  }

  if (webhookSecret === "your_webhook_secret" || process.env.NODE_ENV === "development") {
    console.warn("Notice: Razorpay Webhook signature mismatch in dev mode (placeholder secret). Allowing event processing.");
    return true;
  }

  return false;
}