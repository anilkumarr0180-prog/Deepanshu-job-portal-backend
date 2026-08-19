import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import SubscriptionPlan from "../models/subscription-plan.model";

export async function provisionPolarPlans() {
  const token = process.env.POLAR_ACCESS_TOKEN;
  if (!token) {
    throw new Error("[ERROR] POLAR_ACCESS_TOKEN environment variable is missing.");
  }

  const serverUrl = process.env.POLAR_SERVER_URL || "https://sandbox-api.polar.sh";
  console.log(`[START] Starting Polar Sandbox Product & Price Provisioning against ${serverUrl}...`);

  // Fetch existing non-archived products from Polar Sandbox API for deterministic lookup
  let existingPolarProducts: any[] = [];
  try {
    const listRes = await fetch(`${serverUrl}/v1/products?is_archived=false`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      existingPolarProducts = listData.items || (Array.isArray(listData) ? listData : []);
    }
  } catch (err: any) {
    console.warn(`[NOTICE] Could not pre-fetch existing Polar products: ${err.message}`);
  }

  const paidPlans = await SubscriptionPlan.find({
    price: { $gt: 0 },
    code: { $not: /free/i },
  });

  const createdPlans: string[] = [];
  const skippedPlans: string[] = [];
  const failedPlans: string[] = [];

  for (const plan of paidPlans) {
    const polarMapping = plan.providerMappings?.polar;
    const hasProductId = Boolean(polarMapping?.productId);
    const hasPriceId = Boolean(polarMapping?.priceId);

    // Idempotency Check Case 1: Already fully mapped in MongoDB
    if (hasProductId && hasPriceId) {
      console.log(`[SKIP] Plan '${plan.code}' already has Polar mapping: productId='${polarMapping!.productId}', priceId='${polarMapping!.priceId}'`);
      skippedPlans.push(plan.code);
      continue;
    }

    // Idempotency Check Case 2: Inconsistent state (one missing)
    if (hasProductId !== hasPriceId) {
      const msg = `[ERROR] Plan '${plan.code}' has inconsistent Polar mapping in MongoDB: productId='${polarMapping?.productId}', priceId='${polarMapping?.priceId}'`;
      console.error(msg);
      failedPlans.push(plan.code);
      throw new Error(msg);
    }

    // Check if product already exists in Polar Sandbox with matching metadata code
    const matchingPolarProduct = existingPolarProducts.find(
      (p) => p.metadata?.code === plan.code && !p.is_archived
    );

    if (matchingPolarProduct) {
      const productId = matchingPolarProduct.id;
      const priceId = matchingPolarProduct.prices?.[0]?.id;

      if (productId && priceId) {
        plan.set("providerMappings.polar", { productId, priceId });
        await plan.save();
        console.log(`[ATTACH] Plan '${plan.code}' matched existing Polar product: productId='${productId}', priceId='${priceId}'`);
        createdPlans.push(plan.code);
        continue;
      }
    }

    // Create Product + Price on Polar Sandbox API
    const priceInPaiseCents = Math.round(plan.price * 100);
    const interval = plan.billingPeriod === "yearly" ? "year" : "month";
    const currency = (plan.currency || "INR").toLowerCase();

    const productPayload = {
      name: plan.name,
      description: plan.description,
      recurring_interval: interval,
      prices: [
        {
          amount_type: "fixed",
          price_amount: priceInPaiseCents,
          price_currency: currency,
          type: "recurring",
          recurring_interval: interval,
        },
      ],
      metadata: {
        code: plan.code,
        targetRole: plan.targetRole,
        billingPeriod: plan.billingPeriod,
      },
    };

    try {
      const createRes = await fetch(`${serverUrl}/v1/products`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(productPayload),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        const msg = `[ERROR] Failed to create Polar product for plan '${plan.code}': HTTP ${createRes.status} - ${errText}`;
        console.error(msg);
        failedPlans.push(plan.code);
        throw new Error(msg);
      }

      const resData = await createRes.json();
      const productId = resData.id;
      const priceId = resData.prices?.[0]?.id;

      if (!productId || !priceId) {
        const msg = `[ERROR] Polar product response for plan '${plan.code}' missing productId or priceId: productId='${productId}', priceId='${priceId}'`;
        console.error(msg);
        failedPlans.push(plan.code);
        throw new Error(msg);
      }

      // Save newly provisioned IDs into MongoDB
      plan.set("providerMappings.polar", { productId, priceId });
      await plan.save();

      console.log(`[CREATE] Plan '${plan.code}': productId='${productId}', priceId='${priceId}'`);
      createdPlans.push(plan.code);
    } catch (err: any) {
      console.error(`[ERROR] Exception during Polar provisioning for plan '${plan.code}': ${err.message}`);
      if (!failedPlans.includes(plan.code)) failedPlans.push(plan.code);
      throw err;
    }
  }

  console.log("\n=======================================================================");
  console.log("[COMPLETE] Polar Provisioning Summary:");
  console.log(`  Created (${createdPlans.length}): ${createdPlans.join(", ") || "None"}`);
  console.log(`  Skipped (${skippedPlans.length}): ${skippedPlans.join(", ") || "None"}`);
  console.log(`  Failed  (${failedPlans.length}): ${failedPlans.join(", ") || "None"}`);
  console.log("=======================================================================\n");

  return { createdPlans, skippedPlans, failedPlans };
}

// Standalone runner execution
if (require.main === module) {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI environment variable is missing.");
    process.exit(1);
  }

  mongoose
    .connect(uri)
    .then(async () => {
      await provisionPolarPlans();
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error("Provisioning failed:", err);
      process.exit(1);
    });
}
