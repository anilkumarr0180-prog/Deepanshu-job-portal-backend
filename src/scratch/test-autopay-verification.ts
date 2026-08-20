import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import User from "../models/user.model";
import SubscriptionPlan from "../models/subscription-plan.model";
import Subscription from "../models/subscription.model";
import PaymentTransaction from "../models/payment-transaction.model";
import {
  processCheckoutSession,
  processAutopayRenewalCycle,
  cancelUserSubscription,
  reactivateUserSubscription,
  handlePolarWebhookEvent,
} from "../services/subscription.service";

async function runAutopayVerification() {
  console.log("===============================================================");
  console.log("🚀 STARTING E2E AUTOPAY & RECURRING BILLING VERIFICATION SUITE");
  console.log("===============================================================");

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI environment variable is missing!");
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

  // 1. Locate or create a test candidate user
  let testUser = await User.findOne({ email: "autopay_test_user@example.com" });
  if (!testUser) {
    testUser = await User.create({
      name: "Autopay Test Candidate",
      email: "autopay_test_user@example.com",
      password: "TestPassword123!",
      role: "candidate",
      isEmailVerified: true,
    });
    console.log("✓ Created test user:", testUser.email);
  } else {
    console.log("✓ Found existing test user:", testUser.email);
  }

  const userId = testUser._id.toString();

  // 2. Locate canonical candidate_pro plan
  const proPlan = await SubscriptionPlan.findOne({ code: "candidate_pro" });
  if (!proPlan) {
    throw new Error("Canonical plan candidate_pro not found in MongoDB!");
  }
  console.log(`✓ Located plan: '${proPlan.name}' (code: '${proPlan.code}', USD: $${proPlan.usdPrice})`);

  // 3. Clean up past test data for isolated execution
  await Subscription.deleteMany({ userId: testUser._id });
  await PaymentTransaction.deleteMany({ userId: testUser._id });

  // TEST 1: Initial Autopay Checkout Activation
  console.log("\n--- TEST 1: Initial Polar Autopay Checkout Activation ---");
  const testCheckoutId = `chk_test_autopay_${Date.now()}`;
  const testSubId = `sub_polar_test_${Date.now()}`;

  const checkoutResult = await processCheckoutSession(
    userId,
    "candidate_pro",
    "polar",
    undefined,
    {
      checkoutId: testCheckoutId,
      paymentId: testCheckoutId,
      subscriptionId: testSubId,
      provider: "polar",
    }
  );

  const initialSub = await Subscription.findById(checkoutResult.subscription?._id);
  if (!initialSub) throw new Error("FAIL: Subscription document not created in MongoDB!");
  if (initialSub.billingType !== "recurring") throw new Error(`FAIL: Expected billingType 'recurring', got '${initialSub.billingType}'`);
  if (initialSub.cancelAtPeriodEnd !== false) throw new Error(`FAIL: Expected cancelAtPeriodEnd false, got ${initialSub.cancelAtPeriodEnd}`);
  if (initialSub.providerSubscriptionId !== testSubId) throw new Error("FAIL: providerSubscriptionId mismatch");

  console.log("✓ TEST 1 PASSED: Subscription activated with billingType='recurring' and cancelAtPeriodEnd=false.");
  console.log("  Initial Period End:", initialSub.currentPeriodEnd.toISOString());

  // TEST 2: Automated Recurring Autopay Renewal Webhook
  console.log("\n--- TEST 2: Automated Polar Recurring Renewal Webhook ---");
  const initialPeriodEndMs = new Date(initialSub.currentPeriodEnd).getTime();

  // Simulate Polar order.created recurring renewal webhook payload
  const renewalOrderId = `ord_polar_renewal_${Date.now()}`;
  const polarWebhookPayload = {
    id: `evt_polar_renew_${Date.now()}`,
    type: "order.created",
    data: {
      id: renewalOrderId,
      subscription_id: testSubId,
      total_amount: 200, // $2.00 in cents
      currency: "usd",
      status: "paid",
      billing_reason: "subscription_cycle",
    },
  };

  const webhookResult = await handlePolarWebhookEvent(
    JSON.stringify(polarWebhookPayload),
    "dev_signature_override",
    polarWebhookPayload
  );

  if (webhookResult.status !== "processed") {
    throw new Error(`FAIL: Webhook returned status '${webhookResult.status}'`);
  }

  // Verify updated subscription in MongoDB
  const renewedSub = await Subscription.findById(initialSub._id);
  if (!renewedSub) throw new Error("FAIL: Renewed subscription missing!");

  const renewedPeriodEndMs = new Date(renewedSub.currentPeriodEnd).getTime();
  if (renewedPeriodEndMs <= initialPeriodEndMs) {
    throw new Error("FAIL: currentPeriodEnd was not extended during renewal cycle!");
  }

  // Verify renewal PaymentTransaction record in MongoDB
  const renewalTxn = await PaymentTransaction.findOne({ transactionId: renewalOrderId });
  if (!renewalTxn) throw new Error("FAIL: Renewal PaymentTransaction document was not created!");
  if (renewalTxn.type !== "renewal") throw new Error(`FAIL: Expected transaction type 'renewal', got '${renewalTxn.type}'`);
  if (renewalTxn.status !== "succeeded") throw new Error("FAIL: Renewal transaction status is not 'succeeded'");

  console.log("✓ TEST 2 PASSED: Autopay renewal successfully processed via webhook!");
  console.log("  New Extended Period End:", renewedSub.currentPeriodEnd.toISOString());
  console.log("  Recorded Renewal Transaction ID:", renewalTxn.transactionId, `($${renewalTxn.amount} ${renewalTxn.currency})`);

  // TEST 3: User Opts Out of Autopay (Cancel Auto-Renewal)
  console.log("\n--- TEST 3: User Disables Autopay (Cancel Auto-Renewal) ---");
  const canceledSub = await cancelUserSubscription(userId);
  if (canceledSub.cancelAtPeriodEnd !== true) {
    throw new Error(`FAIL: Expected cancelAtPeriodEnd=true, got ${canceledSub.cancelAtPeriodEnd}`);
  }
  if (canceledSub.status !== "active") {
    throw new Error(`FAIL: Status should remain 'active' until period end, got '${canceledSub.status}'`);
  }
  console.log("✓ TEST 3 PASSED: cancelAtPeriodEnd=true, status='active' (Features remain live until cycle end).");

  // TEST 4: User Re-Enables Autopay (1-Click Reactivate)
  console.log("\n--- TEST 4: User Re-Enables Autopay (Reactivate) ---");
  const reactivatedSub = await reactivateUserSubscription(userId);
  if (reactivatedSub.cancelAtPeriodEnd !== false) {
    throw new Error(`FAIL: Expected cancelAtPeriodEnd=false, got ${reactivatedSub.cancelAtPeriodEnd}`);
  }
  console.log("✓ TEST 4 PASSED: cancelAtPeriodEnd=false (Autopay is re-enabled for next cycle).");

  // Cleanup test user documents
  await Subscription.deleteMany({ userId: testUser._id });
  await PaymentTransaction.deleteMany({ userId: testUser._id });
  await User.deleteOne({ _id: testUser._id });

  console.log("\n===============================================================");
  console.log("🎉 ALL E2E AUTOPAY & RECURRING BILLING TESTS PASSED 100%!");
  console.log("===============================================================\n");

  await mongoose.disconnect();
  process.exit(0);
}

runAutopayVerification().catch((err) => {
  console.error("\n❌ TEST FAILED WITH ERROR:", err);
  process.exit(1);
});
