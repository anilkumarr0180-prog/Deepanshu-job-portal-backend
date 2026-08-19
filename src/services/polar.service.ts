import crypto from "crypto";
import { env } from "../config/env";
import { ISubscriptionPlan } from "../models/subscription-plan.model";

import SubscriptionPlan from "../models/subscription-plan.model";
import { validatePolarMapping, ensurePolarPlan } from "./polar-catalog.service";

export function getPolarCredentials() {
  const accessToken = env.POLAR_ACCESS_TOKEN;
  const serverUrl = env.POLAR_SERVER_URL || "https://sandbox-api.polar.sh";
  const webhookSecret = process.env.POLAR_WEBHOOK_SECRET || env.POLAR_WEBHOOK_SECRET;

  return {
    accessToken,
    serverUrl,
    webhookSecret,
    isConfigured: Boolean(accessToken),
  };
}

/**
 * Resolves the Polar Price ID from providerMappings, auto-healing and provisioning if mapping is missing or archived.
 */
export async function resolveOrProvisionPolarPriceId(plan: ISubscriptionPlan): Promise<string | undefined> {
  if (plan.price === 0 || plan.code.includes("free") || plan.provider === "internal") {
    return undefined;
  }

  const isValid = await validatePolarMapping(plan);
  if (isValid && plan.providerMappings?.polar?.priceId) {
    return plan.providerMappings.polar.priceId.trim();
  }

  console.warn(`[Polar Price Resolver] Stale or missing Polar mapping detected for plan '${plan.code}'. Auto-provisioning active catalog...`);
  const provisioned = await ensurePolarPlan(plan);
  return provisioned.priceId;
}

/**
 * Sync helper: returns existing price ID or throws error.
 */
export function getPolarPlanPriceId(plan: ISubscriptionPlan): string | undefined {
  if (plan.price === 0 || plan.code.includes("free") || plan.provider === "internal") {
    return undefined;
  }

  const priceId = plan.providerMappings?.polar?.priceId;
  if (!priceId || !priceId.trim()) {
    throw new Error(`Paid plan '${plan.code}' does not have a valid Polar provider mapping (providerMappings.polar.priceId missing).`);
  }

  return priceId.trim();
}

/**
 * Creates a Polar Checkout Session using canonical product_price_id from MongoDB, with self-healing retry.
 */
export async function createPolarCheckout(params: {
  priceId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  planCode: string;
  couponCode?: string;
  successUrl?: string;
  /** Existing Polar subscription ID - required for upgrades to avoid "already have an active subscription" error */
  existingSubscriptionId?: string;
}) {
  const { accessToken, serverUrl, isConfigured } = getPolarCredentials();

  if (!isConfigured) {
    throw new Error("Polar API access token (POLAR_ACCESS_TOKEN) is not configured in server environment variables.");
  }

  const metadata: Record<string, string> = {
    userId: params.userId,
    planCode: params.planCode,
  };

  if (params.couponCode && params.couponCode.trim()) {
    metadata.couponCode = params.couponCode.trim();
  }

  const defaultSuccessUrl = `http://localhost:5173/billing?checkout_id={CHECKOUT_ID}&status=success`;
  let successUrl = params.successUrl || defaultSuccessUrl;

  if (!successUrl.includes("{CHECKOUT_ID}") && !successUrl.includes("checkout_id=")) {
    const separator = successUrl.includes("?") ? "&" : "?";
    successUrl = `${successUrl}${separator}checkout_id={CHECKOUT_ID}`;
  }

  const payload: any = {
    product_price_id: params.priceId,
    success_url: successUrl,
    metadata,
  };

  // UPGRADE FIX: If user already has an active Polar subscription, pass its ID so Polar
  // treats this as a subscription upgrade instead of a brand-new purchase.
  // Without this, Polar blocks checkout with "You already have an active subscription."
  if (params.existingSubscriptionId && params.existingSubscriptionId.trim()) {
    payload.subscription_upgrade_subscription_id = params.existingSubscriptionId.trim();
    console.log(`[Polar Checkout] Upgrade mode - existing subscription: ${params.existingSubscriptionId}`);
  }

  if (params.userEmail && params.userEmail.includes("@") && !params.userEmail.endsWith("@example.com")) {
    payload.customer_email = params.userEmail;
  }
  if (params.userName && params.userName.trim()) {
    payload.customer_name = params.userName.trim();
  }

  const response = await fetch(`${serverUrl}/v1/checkouts/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const isArchivedOrInvalid =
      response.status === 422 ||
      errorText.includes("Product is archived") ||
      errorText.includes("PolarRequestValidationError") ||
      errorText.includes("not found");

    if (isArchivedOrInvalid && params.planCode) {
      console.warn(`[Polar Checkout] Stale/archived price ID '${params.priceId}' rejected for plan '${params.planCode}'. Executing dynamic self-healing...`);
      const targetPlan = await SubscriptionPlan.findOne({ code: params.planCode });
      if (targetPlan) {
        // Force reset stale mapping
        targetPlan.providerMappings = targetPlan.providerMappings || {};
        delete targetPlan.providerMappings.polar;
        await targetPlan.save();

        const healed = await ensurePolarPlan(targetPlan);
        if (healed && healed.priceId) {
          console.log(`[Polar Self-Healing Success] Provisioned new active priceId '${healed.priceId}'. Retrying checkout...`);
          payload.product_price_id = healed.priceId;

          const retryRes = await fetch(`${serverUrl}/v1/checkouts/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify(payload),
          });

          if (retryRes.ok) {
            const data: any = await retryRes.json();
            return {
              id: data.id as string,
              url: data.url as string,
              status: data.status as string,
              priceId: data.product_price_id as string,
              productId: data.product_id as string,
              amount: (data.total_amount || data.amount || 0) / 100,
              currency: (data.currency || "inr").toUpperCase(),
              metadata: data.metadata || {},
            };
          } else {
            const retryErrText = await retryRes.text();
            throw new Error(`Polar Checkout Creation Failed after self-healing retry: HTTP ${retryRes.status} - ${retryErrText}`);
          }
        }
      }
    }

    throw new Error(`Polar Checkout Creation Failed: HTTP ${response.status} - ${errorText}`);
  }

  const data: any = await response.json();

  return {
    id: data.id as string,
    url: data.url as string,
    status: data.status as string,
    priceId: data.product_price_id as string,
    productId: data.product_id as string,
    amount: (data.total_amount || data.amount || 0) / 100,
    currency: (data.currency || "inr").toUpperCase(),
    metadata: data.metadata || {},
  };
}

/**
 * Fetches checkout session status directly from Polar API.
 */
export async function fetchPolarCheckout(checkoutId: string) {
  const { accessToken, serverUrl, isConfigured } = getPolarCredentials();

  if (!isConfigured) {
    throw new Error("Polar API access token (POLAR_ACCESS_TOKEN) is not configured in server environment variables.");
  }

  const response = await fetch(`${serverUrl}/v1/checkouts/${checkoutId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Polar Fetch Checkout Failed: HTTP ${response.status} - ${errorText}`);
  }

  const data: any = await response.json();

  let subscriptionId = data.subscription_id;
  if (!subscriptionId && (data.status === "succeeded" || data.status === "confirmed")) {
    try {
      const subRes = await fetch(`${serverUrl}/v1/subscriptions/?limit=50`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(5000),
      });
      if (subRes.ok) {
        const subData: any = await subRes.json();
        const items = Array.isArray(subData) ? subData : subData.items || [];
        const matchedSub = items.find((s: any) => s.checkout_id === checkoutId);
        if (matchedSub) {
          subscriptionId = matchedSub.id;
        }
      }
    } catch (err) {
      console.warn("[Polar Fetch Checkout] Failed to fetch fallback subscription:", err);
    }
  }

  return {
    id: data.id as string,
    status: data.status as string,
    priceId: data.product_price_id as string,
    productId: data.product_id as string,
    amount: (data.total_amount || data.amount || 0) / 100,
    currency: (data.currency || "inr").toUpperCase(),
    customerEmail: data.customer_email as string | undefined,
    metadata: data.metadata || {},
    subscriptionId: subscriptionId as string | undefined,
  };
}

/**
 * Fetches the user's active Polar subscription by customer email.
 * Returns the first active subscription ID found, or null.
 */
export async function findActivePolarSubscriptionByEmail(email: string): Promise<string | null> {
  const { accessToken, serverUrl, isConfigured } = getPolarCredentials();
  if (!isConfigured || !email) return null;

  try {
    const res = await fetch(`${serverUrl}/v1/subscriptions/?customer_email=${encodeURIComponent(email)}&limit=50`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const items: any[] = Array.isArray(data) ? data : (data.items || data.result || []);
    const activeSub = items.find((s: any) => s.status === "active" || s.status === "trialing");
    return activeSub?.id || null;
  } catch (err) {
    console.warn("[Polar] findActivePolarSubscriptionByEmail failed:", err);
    return null;
  }
}


/**
 * Upgrades an existing Polar subscription to a new price via PATCH.
 *
 * Polar's PATCH /v1/subscriptions/{id} uses a discriminated union.
 * The correct body for a plan change is: { price_id: newPriceId }
 */
export async function upgradePolarSubscription(subscriptionId: string, newPriceId: string): Promise<any> {
  const { accessToken, serverUrl, isConfigured } = getPolarCredentials();
  if (!isConfigured) throw new Error("Polar API access token is not configured.");

  const res = await fetch(`${serverUrl}/v1/subscriptions/${subscriptionId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    // Polar discriminated union: use price_id for plan changes (NOT product_price_id)
    body: JSON.stringify({ price_id: newPriceId }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Polar subscription upgrade failed: HTTP ${res.status} - ${errText}`);
  }

  return await res.json();
}


function safeCompareSignatures(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "utf-8"), Buffer.from(b, "utf-8"));
  } catch {
    return false;
  }
}

/**
 * Verifies HMAC / Standard Webhooks signature for Polar Webhooks.
 */
export function verifyPolarWebhookSignature(rawBody: string | Buffer, signatureHeader: string, secretOverride?: string): boolean {
  const { webhookSecret } = getPolarCredentials();
  const effectiveSecret = secretOverride || webhookSecret;

  if (!effectiveSecret) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Polar Webhook] POLAR_WEBHOOK_SECRET missing in dev environment. Allowing event for testing.");
      return true;
    }
    throw new Error("Polar POLAR_WEBHOOK_SECRET is not configured.");
  }

  if (!signatureHeader || !signatureHeader.trim()) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[Polar Webhook] Missing webhook signature header in dev mode. Allowing event for testing.");
      return true;
    }
    return false;
  }

  try {
    const rawBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, "utf-8");
    const secretKey = effectiveSecret.startsWith("whsec_")
      ? Buffer.from(effectiveSecret.replace("whsec_", ""), "base64")
      : Buffer.from(effectiveSecret, "utf-8");

    // Compute expected signatures (hex and base64)
    const hmac = crypto.createHmac("sha256", secretKey).update(rawBuffer);
    const expectedHex = hmac.digest("hex");
    const expectedBase64 = crypto.createHmac("sha256", secretKey).update(rawBuffer).digest("base64");

    // Parse signatures from header (header format can be: "v1,sig1 v1,sig2" or "v1=sig1" or raw sig)
    const passedSigs = signatureHeader
      .split(/\s+/)
      .map((part) => part.replace(/^v1[,=]/, "").trim())
      .filter(Boolean);


    for (const sig of passedSigs) {
      if (safeCompareSignatures(expectedHex, sig) || safeCompareSignatures(expectedBase64, sig)) {
        return true;
      }
    }

    if (
      process.env.NODE_ENV === "development" ||
      !effectiveSecret
    ) {
      console.warn("[Polar Webhook] Dev Mode Warning: Signature verification mismatch. Allowing event processing for local testing.");
      return true;
    }

    return false;
  } catch (err: any) {
    console.error("[Polar Webhook Verification Error]:", err.message);
    if (process.env.NODE_ENV === "development") {
      return true;
    }
    return false;
  }
}
