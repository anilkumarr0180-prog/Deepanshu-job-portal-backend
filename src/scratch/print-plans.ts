import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import SubscriptionPlan from "../models/subscription-plan.model";

async function printPlans() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const plans = await SubscriptionPlan.find({}).lean();
  console.log("\n=======================================================================");
  console.log("MongoDB SubscriptionPlan Provider Mappings Status:");
  console.log("=======================================================================");
  for (const p of plans) {
    console.log(`Plan: ${p.code.padEnd(28)} | Price: ${String(p.price).padStart(5)} ${p.currency} | Billing: ${p.billingPeriod.padEnd(7)}`);
    console.log(`  - Razorpay Plan ID: ${p.providerMappings?.razorpay?.planId || "(none)"}`);
    console.log(`  - Polar Product ID: ${p.providerMappings?.polar?.productId || "(none)"}`);
    console.log(`  - Polar Price ID:   ${p.providerMappings?.polar?.priceId || "(none)"}`);
  }
  console.log("=======================================================================\n");
  await mongoose.disconnect();
}

printPlans().catch(console.error);
