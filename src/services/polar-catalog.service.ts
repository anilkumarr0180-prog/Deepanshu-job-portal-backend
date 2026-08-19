import SubscriptionPlan, { ISubscriptionPlan } from "../models/subscription-plan.model";
import { getPolarCredentials } from "./polar.service";

export interface PolarPrice {
  id: string;
  product_id: string;
  price_amount: number;
  price_currency: string;
  recurring_interval: "month" | "year" | string;
  is_archived?: boolean;
}

export interface PolarProduct {
  id: string;
  name: string;
  description?: string;
  is_archived?: boolean;
  metadata?: Record<string, string>;
  prices?: PolarPrice[];
}

export interface SyncPlanResult {
  code: string;
  status: "existing" | "created" | "skipped_free";
  productId?: string;
  priceId?: string;
  error?: string;
}

export interface CatalogSyncSummary {
  createdProducts: number;
  createdPrices: number;
  existingMappings: number;
  skippedFree: number;
  errors: number;
  details: SyncPlanResult[];
}

/**
 * Searches Polar for an existing product using deterministic metadata: jobbox_plan_code === planCode.
 */
export async function findExistingPolarProduct(planCode: string): Promise<PolarProduct | null> {
  const { accessToken, serverUrl, isConfigured } = getPolarCredentials();
  if (!isConfigured) {
    throw new Error("Polar POLAR_ACCESS_TOKEN is not configured.");
  }

  const fetchProducts = async (isArchived: boolean): Promise<PolarProduct[]> => {
    const response = await fetch(`${serverUrl}/v1/products/?is_archived=${isArchived}&limit=100`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return [];
    const data: any = await response.json();
    return Array.isArray(data) ? data : data.items || [];
  };

  const activeProducts = await fetchProducts(false);
  const matched = activeProducts.find(
    (p) => p.metadata && (p.metadata.code === planCode || p.metadata.jobbox_plan_code === planCode)
  );

  return matched || null;
}

/**
 * Searches Polar for an existing price on a product matching the plan criteria.
 */
export async function findExistingPolarPrice(
  productId: string,
  plan: ISubscriptionPlan
): Promise<PolarPrice | null> {
  const { accessToken, serverUrl, isConfigured } = getPolarCredentials();
  if (!isConfigured) {
    throw new Error("Polar POLAR_ACCESS_TOKEN is not configured.");
  }

  const response = await fetch(`${serverUrl}/v1/products/${productId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) return null;

  const product: PolarProduct = await response.json();
  const prices = product.prices || [];

  const targetUsdPrice = plan.usdPrice !== undefined && plan.usdPrice !== null ? plan.usdPrice : (plan.currency === 'USD' ? plan.price : 10);
  const expectedAmountCents = Math.round(targetUsdPrice * 100);
  const expectedCurrency = "usd";
  const expectedInterval = plan.billingPeriod === "yearly" ? "year" : "month";

  return (
    prices.find(
      (pr) =>
        pr.price_currency?.toLowerCase() === expectedCurrency &&
        pr.price_amount === expectedAmountCents &&
        pr.recurring_interval === expectedInterval &&
        !pr.is_archived
    ) || null
  );
}

/**
 * Creates a Polar Product with deterministic metadata linking to canonical plan code.
 */

/**
 * Un-archives and updates a Polar Product if it was previously archived in the Polar dashboard.
 */
export async function unarchiveAndUpdatePolarProduct(
  productId: string,
  plan: ISubscriptionPlan
): Promise<PolarProduct> {
  const { accessToken, serverUrl, isConfigured } = getPolarCredentials();
  if (!isConfigured) {
    throw new Error("Polar POLAR_ACCESS_TOKEN is not configured.");
  }

  const targetUsdPrice = plan.usdPrice !== undefined && plan.usdPrice !== null ? plan.usdPrice : (plan.currency === 'USD' ? plan.price : 10);
  const expectedUsdCents = Math.round(targetUsdPrice * 100);
  const expectedInrCents = Math.round((plan.price || 99) * 100);

  const getRes = await fetch(`${serverUrl}/v1/products/${productId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  let existingProd: PolarProduct | null = null;
  let existingPrices: any[] = [];
  if (getRes.ok) {
    existingProd = await getRes.json();
    existingPrices = existingProd?.prices || [];
  }

  if (existingProd && existingProd.is_archived) {
    throw new Error(`Product ${productId} is archived on Polar.`);
  }

  // Preserve existing matching prices, or add/replace them cleanly
  const expectedInterval = plan.billingPeriod === "yearly" ? "year" : "month";
  const pricesPayload: any[] = [];

  const matchingInr = existingPrices.find(
    (p) =>
      p.price_currency?.toLowerCase() === "inr" &&
      p.price_amount === expectedInrCents &&
      !p.is_archived
  );
  if (matchingInr) {
    pricesPayload.push({ id: matchingInr.id });
  } else {
    pricesPayload.push({
      type: "recurring",
      amount_type: "fixed",
      price_amount: expectedInrCents,
      price_currency: "inr",
      recurring_interval: expectedInterval,
    });
  }

  const matchingUsd = existingPrices.find(
    (p) =>
      p.price_currency?.toLowerCase() === "usd" &&
      p.price_amount === expectedUsdCents &&
      (!p.recurring_interval || p.recurring_interval === expectedInterval) &&
      !p.is_archived
  );
  if (matchingUsd) {
    pricesPayload.push({ id: matchingUsd.id });
  } else {
    pricesPayload.push({
      type: "recurring",
      amount_type: "fixed",
      price_amount: expectedUsdCents,
      price_currency: "usd",
      recurring_interval: expectedInterval,
    });
  }

  existingPrices.forEach((p) => {
    const currency = p.price_currency?.toLowerCase();
    if (currency !== "inr" && currency !== "usd" && !p.is_archived) {
      pricesPayload.push({ id: p.id });
    }
  });

  const payload = {
    is_archived: false,
    name: plan.name,
    description: plan.description || plan.name,
    metadata: {
      code: plan.code,
      jobbox_plan_code: plan.code,
      target_role: plan.targetRole,
      billing_period: plan.billingPeriod,
    },
    prices: pricesPayload,
  };

  const response = await fetch(`${serverUrl}/v1/products/${productId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.warn(`[Polar Product Unarchive Warning] HTTP ${response.status} - ${errorText}`);
    if (existingProd) return existingProd;
    throw new Error(`Polar Unarchive/Update Product Failed: HTTP ${response.status} - ${errorText}`);
  }

  return await response.json();
}

export async function createPolarProduct(plan: ISubscriptionPlan): Promise<PolarProduct> {
  const { accessToken, serverUrl, isConfigured } = getPolarCredentials();
  if (!isConfigured) {
    throw new Error("Polar POLAR_ACCESS_TOKEN is not configured.");
  }

  const targetUsdPrice = plan.usdPrice !== undefined && plan.usdPrice !== null ? plan.usdPrice : (plan.currency === 'USD' ? plan.price : 10);
  const expectedUsdCents = Math.round(targetUsdPrice * 100);
  const expectedInrCents = Math.round((plan.price || 99) * 100);
  const expectedInterval = plan.billingPeriod === "yearly" ? "year" : "month";

  const payload = {
    name: plan.name,
    description: plan.description || plan.name,
    recurring_interval: expectedInterval,
    metadata: {
      jobbox_plan_code: plan.code,
      target_role: plan.targetRole,
      billing_period: plan.billingPeriod,
    },
    prices: [
      {
        type: "recurring",
        amount_type: "fixed",
        price_amount: expectedInrCents,
        price_currency: "inr",
        recurring_interval: expectedInterval,
      },
      {
        type: "recurring",
        amount_type: "fixed",
        price_amount: expectedUsdCents,
        price_currency: "usd",
        recurring_interval: expectedInterval,
      },
    ],
  };

  const response = await fetch(`${serverUrl}/v1/products/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Polar Create Product Failed: HTTP ${response.status} - ${errorText}`);
  }

  const createdProduct: PolarProduct = await response.json();
  return createdProduct;
}

/**
 * Creates a Polar Price attached to an existing product.
 */
export async function createPolarPrice(
  productId: string,
  plan: ISubscriptionPlan
): Promise<PolarPrice> {
  const { accessToken, serverUrl, isConfigured } = getPolarCredentials();
  if (!isConfigured) {
    throw new Error("Polar POLAR_ACCESS_TOKEN is not configured.");
  }

  const targetUsdPrice = plan.usdPrice !== undefined && plan.usdPrice !== null ? plan.usdPrice : (plan.currency === 'USD' ? plan.price : 10);
  const expectedUsdCents = Math.round(targetUsdPrice * 100);
  const expectedInrCents = Math.round((plan.price || 99) * 100);

  const getRes = await fetch(`${serverUrl}/v1/products/${productId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10000),
  });

  let existingPrices: any[] = [];
  if (getRes.ok) {
    const prod: PolarProduct = await getRes.json();
    existingPrices = prod.prices || [];
  }

  const expectedInterval = plan.billingPeriod === "yearly" ? "year" : "month";
  const pricesPayload: any[] = [];

  const matchingInr = existingPrices.find(
    (p) =>
      p.price_currency?.toLowerCase() === "inr" &&
      p.price_amount === expectedInrCents &&
      !p.is_archived
  );
  if (matchingInr) {
    pricesPayload.push({ id: matchingInr.id });
  } else {
    pricesPayload.push({
      type: "recurring",
      amount_type: "fixed",
      price_amount: expectedInrCents,
      price_currency: "inr",
      recurring_interval: expectedInterval,
    });
  }

  const matchingUsd = existingPrices.find(
    (p) =>
      p.price_currency?.toLowerCase() === "usd" &&
      p.price_amount === expectedUsdCents &&
      (!p.recurring_interval || p.recurring_interval === expectedInterval) &&
      !p.is_archived
  );
  if (matchingUsd) {
    pricesPayload.push({ id: matchingUsd.id });
  } else {
    pricesPayload.push({
      type: "recurring",
      amount_type: "fixed",
      price_amount: expectedUsdCents,
      price_currency: "usd",
      recurring_interval: expectedInterval,
    });
  }

  existingPrices.forEach((p) => {
    const currency = p.price_currency?.toLowerCase();
    if (currency !== "inr" && currency !== "usd" && !p.is_archived) {
      pricesPayload.push({ id: p.id });
    }
  });

  const payload = { prices: pricesPayload };

  const response = await fetch(`${serverUrl}/v1/products/${productId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Polar Create Price Failed: HTTP ${response.status} - ${errorText}`);
  }

  const updatedProduct: PolarProduct = await response.json();
  const prices = updatedProduct.prices || [];
  const createdPrice = prices.find(
    (pr) =>
      pr.price_currency?.toLowerCase() === "usd" &&
      pr.price_amount === expectedUsdCents
  ) || prices[prices.length - 1];

  if (!createdPrice) {
    throw new Error(`Failed to resolve created price for product ${productId}`);
  }

  return createdPrice;
}

/**
 * Validates that an existing stored Polar mapping matches canonical MongoDB plan definition.
 */
export async function validatePolarMapping(plan: ISubscriptionPlan): Promise<boolean> {
  if (!plan.providerMappings?.polar?.productId || !plan.providerMappings?.polar?.priceId) {
    return false;
  }

  const { productId, priceId } = plan.providerMappings.polar;
  const { accessToken, serverUrl, isConfigured } = getPolarCredentials();
  if (!isConfigured) return false;

  try {
    const response = await fetch(`${serverUrl}/v1/products/${productId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) return false;

    const product: PolarProduct = await response.json();
    if (product.is_archived) return false;

    const prices = product.prices || [];
    const priceObj = prices.find((p) => p.id === priceId);

    if (!priceObj || priceObj.is_archived) return false;

    const targetUsdPrice = plan.usdPrice !== undefined && plan.usdPrice !== null ? plan.usdPrice : (plan.currency === 'USD' ? plan.price : 10);
  const expectedAmountCents = Math.round(targetUsdPrice * 100);
  const expectedCurrency = "usd";
    const expectedInterval = plan.billingPeriod === "yearly" ? "year" : "month";

    const isMatch =
      priceObj.price_amount === expectedAmountCents &&
      priceObj.price_currency.toLowerCase() === expectedCurrency &&
      (!priceObj.recurring_interval || priceObj.recurring_interval === expectedInterval);

    return isMatch;
  } catch {
    return false;
  }
}

/**
 * Idempotently provisions or validates Polar product & price for a single canonical SubscriptionPlan.
 */
export async function ensurePolarPlan(plan: ISubscriptionPlan): Promise<{
  productId: string;
  priceId: string;
  status: "existing" | "created";
  createdNewProduct: boolean;
  createdNewPrice: boolean;
}> {
  // Free / internal plans must never be provisioned
  if (plan.price === 0 || plan.code.includes("free") || plan.provider === "internal") {
    throw new Error(`Cannot provision Polar catalog for free/internal plan '${plan.code}'.`);
  }

  // 1. Check existing MongoDB mapping & proactively restore/unarchive if archived on Polar
  const existingProductId = plan.providerMappings?.polar?.productId;
  const existingPriceId = plan.providerMappings?.polar?.priceId;

  if (existingProductId) {
    try {
      const restoredProduct = await unarchiveAndUpdatePolarProduct(existingProductId, plan);
      const targetUsdPrice = plan.usdPrice !== undefined && plan.usdPrice !== null ? plan.usdPrice : (plan.currency === 'USD' ? plan.price : 10);
      const expectedAmountCents = Math.round(targetUsdPrice * 100);
      const expectedInterval = plan.billingPeriod === "yearly" ? "year" : "month";

      let targetPrice: PolarPrice | null = null;
      if (restoredProduct.prices && restoredProduct.prices.length > 0) {
        targetPrice = restoredProduct.prices.find(
          (p) =>
            p.price_currency?.toLowerCase() === "usd" &&
            p.price_amount === expectedAmountCents &&
            (!p.recurring_interval || p.recurring_interval === expectedInterval) &&
            !p.is_archived
        ) || null;
      }
      if (!targetPrice) {
        targetPrice = await createPolarPrice(restoredProduct.id, plan);
      }

      await SubscriptionPlan.findOneAndUpdate(
        { _id: plan._id },
        {
          $set: {
            "providerMappings.polar": {
              productId: restoredProduct.id,
              priceId: targetPrice.id,
            },
          },
        }
      );

      plan.providerMappings = plan.providerMappings || {};
      plan.providerMappings.polar = {
        productId: restoredProduct.id,
        priceId: targetPrice.id,
      };

      return {
        productId: restoredProduct.id,
        priceId: targetPrice.id,
        status: "existing",
        createdNewProduct: false,
        createdNewPrice: false,
      };
    } catch (err) {
      console.warn(`[Polar Restore Warning] Could not unarchive existing product ${existingProductId}, attempting full rediscovery:`, err);
    }
  }

  // 2. Search Polar for existing product by deterministic jobbox_plan_code
  let targetProduct = await findExistingPolarProduct(plan.code);
  let createdNewProduct = false;

  if (!targetProduct) {
    targetProduct = await createPolarProduct(plan);
    createdNewProduct = true;
  } else if (targetProduct.is_archived) {
    targetProduct = await unarchiveAndUpdatePolarProduct(targetProduct.id, plan);
  }

  // 3. Find or create matching price on target product
  let targetPrice: PolarPrice | null = null;
  let createdNewPrice = false;

  if (targetProduct.prices && targetProduct.prices.length > 0) {
    const targetUsdPrice = plan.usdPrice !== undefined && plan.usdPrice !== null ? plan.usdPrice : (plan.currency === 'USD' ? plan.price : 10);
  const expectedAmountCents = Math.round(targetUsdPrice * 100);
  const expectedCurrency = "usd";
    const expectedInterval = plan.billingPeriod === "yearly" ? "year" : "month";

    targetPrice =
      targetProduct.prices.find(
        (pr) =>
          pr.price_currency?.toLowerCase() === expectedCurrency &&
          pr.price_amount === expectedAmountCents &&
          (!pr.recurring_interval || pr.recurring_interval === expectedInterval) &&
          !pr.is_archived
      ) || null;
  }

  if (!targetPrice) {
    targetPrice = await findExistingPolarPrice(targetProduct.id, plan);
  }

  if (!targetPrice) {
    targetPrice = await createPolarPrice(targetProduct.id, plan);
    createdNewPrice = true;
  }

  const finalProductId = targetProduct.id;
  const finalPriceId = targetPrice.id;

  // 4. Atomic Update to MongoDB using $set to prevent overwriting other fields
  const updatedPlan = await SubscriptionPlan.findOneAndUpdate(
    { _id: plan._id },
    {
      $set: {
        "providerMappings.polar": {
          productId: finalProductId,
          priceId: finalPriceId,
        },
      },
    },
    { new: true }
  );

  // 5. Read-Back Verification (Phase 4)
  const reloaded = await SubscriptionPlan.findById(plan._id);
  if (
    !reloaded ||
    reloaded.providerMappings?.polar?.productId !== finalProductId ||
    reloaded.providerMappings?.polar?.priceId !== finalPriceId
  ) {
    throw new Error(
      `Read-Back Verification Failed for plan '${plan.code}': MongoDB persistence did not retain Polar mapping (expected priceId: ${finalPriceId}).`
    );
  }

  // Update in-memory reference
  plan.providerMappings = plan.providerMappings || {};
  plan.providerMappings.polar = {
    productId: finalProductId,
    priceId: finalPriceId,
  };

  return {
    productId: finalProductId,
    priceId: finalPriceId,
    status: createdNewProduct || createdNewPrice ? "created" : "existing",
    createdNewProduct,
    createdNewPrice,
  };
}

/**
 * Idempotently provisions/synchronizes all paid active SubscriptionPlans in MongoDB.
 */
export async function ensureAllPolarPlans(): Promise<CatalogSyncSummary> {
  const { serverUrl, isConfigured } = getPolarCredentials();
  if (!isConfigured) {
    throw new Error("Polar POLAR_ACCESS_TOKEN is not configured.");
  }

  const isSandbox = serverUrl.includes("sandbox");
  console.log(`[Polar Catalog Sync] Operating Mode: ${isSandbox ? "SANDBOX" : "PRODUCTION"} (${serverUrl})`);

  // Exclude non-canonical scratch test plan documents
  const plans = await SubscriptionPlan.find({
    isActive: true,
    code: { $not: /^unmapped_|^test_|^scratch_/ },
  });

  let createdProducts = 0;
  let createdPrices = 0;
  let existingMappings = 0;
  let skippedFree = 0;
  let errors = 0;
  const details: SyncPlanResult[] = [];

  for (const plan of plans) {
    if (plan.price === 0 || plan.code.includes("free") || plan.provider === "internal") {
      skippedFree++;
      details.push({ code: plan.code, status: "skipped_free" });
      continue;
    }

    try {
      const res = await ensurePolarPlan(plan);
      if (res.createdNewProduct) createdProducts++;
      if (res.createdNewPrice) createdPrices++;
      if (res.status === "existing") existingMappings++;

      details.push({
        code: plan.code,
        status: res.status,
        productId: res.productId,
        priceId: res.priceId,
      });
    } catch (err: any) {
      errors++;
      details.push({
        code: plan.code,
        status: "created",
        error: err.message || "Failed to synchronize plan",
      });
    }
  }

  return {
    createdProducts,
    createdPrices,
    existingMappings,
    skippedFree,
    errors,
    details,
  };
}
