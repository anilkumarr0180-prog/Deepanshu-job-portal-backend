import mongoose from "mongoose";
import SubscriptionPlan from "../models/subscription-plan.model";
import { env } from "../config/env";

export async function migrateSubscriptionPlanProviderMappings() {
  console.log("Starting SubscriptionPlan providerMappings migration...");

  const plans = await SubscriptionPlan.find();
  let updatedCount = 0;
  let skippedCount = 0;

  for (const plan of plans) {
    const legacyPlanId = plan.providerPlanId;
    const existingMappedPlanId = plan.providerMappings?.razorpay?.planId;

    // Check for conflicting mappings
    if (existingMappedPlanId && legacyPlanId && existingMappedPlanId !== legacyPlanId) {
      throw new Error(
        `MIGRATION ABORTED: Conflicting Razorpay Plan IDs found for plan '${plan.code}'! ` +
        `providerMappings.razorpay.planId='${existingMappedPlanId}' vs legacy providerPlanId='${legacyPlanId}'`
      );
    }

    // Determine target Razorpay plan ID
    let targetRazorpayId = existingMappedPlanId || legacyPlanId;

    // Fallback lookup from environment variables if legacy field was empty on paid plans
    if (!targetRazorpayId && plan.price > 0) {
      switch (plan.code) {
        case "candidate_pro": targetRazorpayId = env.RAZORPAY_PLAN_CANDIDATE_PRO; break;
        case "candidate_premium": targetRazorpayId = env.RAZORPAY_PLAN_CANDIDATE_PREMIUM; break;
        case "recruiter_lite": targetRazorpayId = env.RAZORPAY_PLAN_RECRUITER_LITE; break;
        case "recruiter_enterprise": targetRazorpayId = env.RAZORPAY_PLAN_RECRUITER_ENTERPRISE; break;
        case "candidate_pro_yearly": targetRazorpayId = env.RAZORPAY_PLAN_CANDIDATE_PRO_YEARLY; break;
        case "candidate_premium_yearly": targetRazorpayId = env.RAZORPAY_PLAN_CANDIDATE_PREMIUM_YEARLY; break;
        case "recruiter_lite_yearly": targetRazorpayId = env.RAZORPAY_PLAN_RECRUITER_LITE_YEARLY; break;
        case "recruiter_enterprise_yearly": targetRazorpayId = env.RAZORPAY_PLAN_RECRUITER_ENTERPRISE_YEARLY; break;
      }
    }

    // If paid plan has no Razorpay ID available anywhere, fail loudly
    if (plan.price > 0 && !targetRazorpayId) {
      throw new Error(`MIGRATION ABORTED: Paid plan '${plan.code}' (price: ${plan.price}) has no Razorpay Plan ID defined!`);
    }

    let needsSave = false;

    if (!plan.providerMappings) {
      plan.providerMappings = {};
    }

    if (targetRazorpayId && plan.providerMappings.razorpay?.planId !== targetRazorpayId) {
      plan.providerMappings.razorpay = { planId: targetRazorpayId };
      needsSave = true;
    }

    // Ensure legacy providerPlanId matches if empty for backward compatibility
    if (targetRazorpayId && !plan.providerPlanId) {
      plan.providerPlanId = targetRazorpayId;
      needsSave = true;
    }

    if (needsSave) {
      await plan.save();
      updatedCount++;
      console.log(`  - Migrated plan '${plan.code}': providerMappings.razorpay.planId = '${targetRazorpayId}'`);
    } else {
      skippedCount++;
    }
  }

  console.log(`Migration complete. Updated: ${updatedCount}, Unchanged/Skipped: ${skippedCount}`);
  return { updatedCount, skippedCount };
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
      await migrateSubscriptionPlanProviderMappings();
      await mongoose.disconnect();
      console.log("Migration script execution finished.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration script failed:", err);
      process.exit(1);
    });
}
