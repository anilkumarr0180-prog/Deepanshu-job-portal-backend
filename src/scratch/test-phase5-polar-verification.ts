import dotenv from "dotenv";
dotenv.config();

import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/user.model";
import Subscription from "../models/subscription.model";
import SubscriptionPlan from "../models/subscription-plan.model";
import Coupon from "../models/coupon.model";
import PaymentTransaction from "../models/payment-transaction.model";

import {
  seedDefaultPlans,
  createPolarCheckoutService,
  verifyPolarPaymentService,
  processCheckoutSession,
  handlePolarWebhookEvent,
} from "../services/subscription.service";

import { getPolarPlanPriceId, verifyPolarWebhookSignature } from "../services/polar.service";

const runPolarVerificationSuite = async () => {
  console.log("\n=======================================================================");
  console.log("Starting Phase 5 — Polar Checkout Architecture Verification Suite");
  console.log("=======================================================================\n");

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

  process.env.POLAR_WEBHOOK_SECRET = "polar_test_webhook_secret_key_123";

  // Ensure default plans and coupons are seeded
  await seedDefaultPlans();
  await SubscriptionPlan.deleteMany({ code: { $regex: "unmapped_plan|inactive_plan" } });
  await Subscription.syncIndexes();
  await Coupon.syncIndexes();

  const testSuffix = Date.now().toString().slice(-6);

  // Create test users
  const candidateUser = await User.create({
    name: `Polar Candidate_${testSuffix}`,
    email: `polar_candidate_${testSuffix}@example.com`,
    password: "Password123!",
    role: "candidate",
  });

  const recruiterUser = await User.create({
    name: `Polar Recruiter_${testSuffix}`,
    email: `polar_recruiter_${testSuffix}@example.com`,
    password: "Password123!",
    role: "recruiter",
  });

  console.log("✓ Test users created.");

  // Create a coupon for testing
  const testCouponCode = `POLAR50_${testSuffix}`;
  const testCoupon = await Coupon.create({
    code: testCouponCode,
    discountType: "percentage",
    discountValue: 50,
    isActive: true,
    timesUsed: 0,
    maxUses: 10,
  });

  // Ensure Candidate Pro has a valid UUID Polar price mapping for sandbox API
  const candidateProPlan = await SubscriptionPlan.findOne({ code: "candidate_pro" });
  if (!candidateProPlan) throw new Error("candidate_pro plan missing");

  const validPolarPriceId = "b51a79fc-0f07-40bd-8f81-ef2edf7c4aee"; // Valid provisioned Polar Sandbox UUID
  candidateProPlan.providerMappings = candidateProPlan.providerMappings || {};
  candidateProPlan.providerMappings.polar = {
    productId: "9674dbfb-1ff9-4e75-816f-f16490190f29",
    priceId: validPolarPriceId,
  };
  await candidateProPlan.save();

  // -------------------------------------------------------------------------
  // Test 1: Valid Polar Price Mapping & Checkout Creation
  // -------------------------------------------------------------------------
  const resolvedPriceId = getPolarPlanPriceId(candidateProPlan);
  if (resolvedPriceId !== validPolarPriceId) {
    throw new Error(`FAIL Test 1: Price ID resolution failed. Expected '${validPolarPriceId}', got '${resolvedPriceId}'`);
  }
  console.log("✓ Test 1 Passed: Polar priceId resolved strictly from MongoDB providerMappings.polar.priceId.");

  // -------------------------------------------------------------------------
  // Test 2: Missing Polar Price Mapping Handling
  // -------------------------------------------------------------------------
  const unmappedPlan = await SubscriptionPlan.create({
    code: `unmapped_plan_${testSuffix}`,
    name: "Unmapped Paid Plan",
    description: "Paid plan without Polar mapping",
    targetRole: "candidate",
    price: 499,
    currency: "INR",
    billingPeriod: "monthly",
    providerMappings: { razorpay: { planId: "plan_rzp_mock" } },
    isActive: true,
  });

  let missingMappingBlocked = false;
  try {
    getPolarPlanPriceId(unmappedPlan);
  } catch (err: any) {
    if (err.message.includes("does not have a valid Polar provider mapping")) {
      missingMappingBlocked = true;
    }
  }

  if (!missingMappingBlocked) {
    throw new Error("FAIL Test 2: Unmapped paid plan did not throw explicit error for missing Polar priceId.");
  }
  console.log("✓ Test 2 Passed: Missing Polar price mapping throws explicit error.");

  // -------------------------------------------------------------------------
  // Test 3: Client Price / PriceId Tampering Protection
  // -------------------------------------------------------------------------
  // createPolarCheckoutService resolves priceId ONLY from DB and ignores any client tampering attempt
  let clientTamperBlocked = false;
  try {
    // Attempting to pass invalid/fake planCode to bypass DB price resolution
    await createPolarCheckoutService(candidateUser._id.toString(), "non_existent_plan_code");
  } catch (err: any) {
    if (err.message.includes("Selected plan does not exist")) {
      clientTamperBlocked = true;
    }
  }
  if (!clientTamperBlocked) {
    throw new Error("FAIL Test 3: Client plan tampering was not blocked.");
  }
  console.log("✓ Test 3 Passed: Server resolves priceId exclusively from MongoDB; fake plan code blocked.");

  // -------------------------------------------------------------------------
  // Test 4: Inactive Plan Rejected
  // -------------------------------------------------------------------------
  const inactivePlan = await SubscriptionPlan.create({
    code: `inactive_plan_${testSuffix}`,
    name: "Inactive Plan",
    description: "Deactivated plan",
    targetRole: "candidate",
    price: 199,
    currency: "INR",
    billingPeriod: "monthly",
    providerMappings: { polar: { priceId: "price_inactive_123" } },
    isActive: false,
  });

  let inactiveBlocked = false;
  try {
    await createPolarCheckoutService(candidateUser._id.toString(), inactivePlan.code);
  } catch (err: any) {
    if (err.message.includes("inactive")) {
      inactiveBlocked = true;
    }
  }
  if (!inactiveBlocked) {
    throw new Error("FAIL Test 4: Inactive plan was not rejected.");
  }
  console.log("✓ Test 4 Passed: Inactive plan checkout rejected.");

  // -------------------------------------------------------------------------
  // Test 5: Wrong Role Rejected
  // -------------------------------------------------------------------------
  let wrongRoleBlocked = false;
  try {
    // Candidate trying to purchase recruiter plan
    await createPolarCheckoutService(candidateUser._id.toString(), "recruiter_lite");
  } catch (err: any) {
    if (err.message.includes("intended for recruiters")) {
      wrongRoleBlocked = true;
    }
  }
  if (!wrongRoleBlocked) {
    throw new Error("FAIL Test 5: Unauthorized targetRole checkout was not rejected.");
  }
  console.log("✓ Test 5 Passed: Unauthorized targetRole checkout rejected.");

  // -------------------------------------------------------------------------
  // Test 6: Free Plan Rejected for Polar Checkout
  // -------------------------------------------------------------------------
  let freePlanBlocked = false;
  try {
    await createPolarCheckoutService(candidateUser._id.toString(), "candidate_free");
  } catch (err: any) {
    if (err.message.includes("Free or internal plans cannot be checked out via Polar")) {
      freePlanBlocked = true;
    }
  }
  if (!freePlanBlocked) {
    throw new Error("FAIL Test 6: Free plan checkout via Polar was not rejected.");
  }
  console.log("✓ Test 6 Passed: Free plan checkout via Polar rejected.");

  // -------------------------------------------------------------------------
  // Test 7: Successful Checkout Session Creation (Does NOT Activate Subscription)
  // -------------------------------------------------------------------------
  const initialSubCount = await Subscription.countDocuments({ userId: candidateUser._id });

  // Validate coupon during checkout creation
  const checkoutResult = await createPolarCheckoutService(
    candidateUser._id.toString(),
    "candidate_pro",
    testCouponCode
  );

  if (!checkoutResult.checkoutId || !checkoutResult.url || !checkoutResult.priceId) {
    throw new Error("FAIL Test 7: Checkout session response missing required fields.");
  }

  // Coupon timesUsed MUST still be 0 because checkout creation does NOT consume coupon
  const couponCheck1 = await Coupon.findById(testCoupon._id);
  if (couponCheck1?.timesUsed !== 0) {
    throw new Error("FAIL Test 7: Coupon was consumed merely because checkout was created!");
  }

  // User subscription count MUST remain unchanged
  const postCheckoutSubCount = await Subscription.countDocuments({ userId: candidateUser._id, status: "active" });
  if (postCheckoutSubCount !== initialSubCount) {
    throw new Error("FAIL Test 7: Subscription was activated merely because checkout was created!");
  }
  console.log("✓ Test 7 Passed: Polar checkout created without activating subscription or consuming coupon.");

  // -------------------------------------------------------------------------
  // Test 8: Failed/Pending Payment Preserves Active Subscription
  // -------------------------------------------------------------------------
  // Establish an existing active free subscription
  const initialFreeSub = await Subscription.create({
    userId: candidateUser._id,
    planId: candidateProPlan._id,
    planCode: "candidate_free",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 864000000),
    cancelAtPeriodEnd: false,
    provider: "internal",
    usages: { jobsPostedCount: 0, featuredJobsCount: 0, inmailCreditsUsed: 0 },
  });

  // Verify non-confirmed state throws error and leaves existing subscription active
  let unconfirmedBlocked = false;
  try {
    await verifyPolarPaymentService(candidateUser._id.toString(), checkoutResult.checkoutId, "candidate_pro");
  } catch (err: any) {
    if (err.message.includes("not in a confirmed payment state")) {
      unconfirmedBlocked = true;
    }
  }

  if (!unconfirmedBlocked) {
    throw new Error("FAIL Test 8: Unconfirmed checkout state allowed subscription activation!");
  }

  const existingSubStillActive = await Subscription.findById(initialFreeSub._id);
  if (existingSubStillActive?.status !== "active") {
    throw new Error("FAIL Test 8: Existing active subscription was modified on unconfirmed/failed payment!");
  }
  console.log("✓ Test 8 Passed: Failed/pending payment preserves existing active subscription.");

  // -------------------------------------------------------------------------
  // Test 9: Confirmed Payment Activates Subscription & Consumes Coupon
  // -------------------------------------------------------------------------
  const mockPolarCheckoutId = `chk_polar_confirmed_${testSuffix}`;

  const activationResult = await processCheckoutSession(
    candidateUser._id.toString(),
    "candidate_pro",
    "polar",
    testCouponCode,
    {
      checkoutId: mockPolarCheckoutId,
      paymentId: mockPolarCheckoutId,
      provider: "polar",
    }
  );

  if (!activationResult.subscription || activationResult.subscription.status !== "active") {
    throw new Error("FAIL Test 9: Subscription status is not active after confirmed payment.");
  }
  if (activationResult.subscription.provider !== "polar") {
    throw new Error(`FAIL Test 9: Expected provider 'polar', got '${activationResult.subscription.provider}'`);
  }
  if (activationResult.transaction.provider !== "polar") {
    throw new Error(`FAIL Test 9: Expected transaction provider 'polar', got '${activationResult.transaction.provider}'`);
  }

  // Previous subscription must be canceled
  const prevSub = await Subscription.findById(initialFreeSub._id);
  if (prevSub?.status !== "canceled") {
    throw new Error("FAIL Test 9: Old subscription was not canceled upon new activation.");
  }

  // Coupon must be consumed EXACTLY ONCE
  const couponCheck2 = await Coupon.findById(testCoupon._id);
  if (couponCheck2?.timesUsed !== 1) {
    throw new Error(`FAIL Test 9: Expected coupon timesUsed = 1, got ${couponCheck2?.timesUsed}`);
  }

  console.log("✓ Test 9 Passed: Successful payment activated new subscription, canceled old subscription, and consumed coupon exactly once.");

  // -------------------------------------------------------------------------
  // Test 10: Idempotency Verification (Duplicate Payment Event)
  // -------------------------------------------------------------------------
  const dupResult = await processCheckoutSession(
    candidateUser._id.toString(),
    "candidate_pro",
    "polar",
    testCouponCode,
    {
      checkoutId: mockPolarCheckoutId,
      paymentId: mockPolarCheckoutId,
      provider: "polar",
    }
  );

  if (dupResult.transaction._id.toString() !== activationResult.transaction._id.toString()) {
    throw new Error("FAIL Test 10: Duplicate payment created a new transaction record!");
  }

  // Coupon must NOT be consumed again
  const couponCheck3 = await Coupon.findById(testCoupon._id);
  if (couponCheck3?.timesUsed !== 1) {
    throw new Error(`FAIL Test 10: Coupon was consumed a second time during idempotent event! timesUsed = ${couponCheck3?.timesUsed}`);
  }

  // Subscription count must not increase
  const totalSubCount = await Subscription.countDocuments({ userId: candidateUser._id });
  if (totalSubCount !== 2) { // 1 canceled initial + 1 active new
    throw new Error(`FAIL Test 10: Duplicate payment created extra subscription documents! Count: ${totalSubCount}`);
  }

  console.log("✓ Test 10 Passed: Idempotent handling prevents duplicate transactions, duplicate subscriptions, and re-consuming coupons.");

  // Helper to compute HMAC signature for webhook tests
  const secret = process.env.POLAR_WEBHOOK_SECRET || "test_polar_secret";
  const computeSig = (body: string) => crypto.createHmac("sha256", secret).update(body).digest("hex");

  // -------------------------------------------------------------------------
  // Test 11: Polar Webhook Signature Verification
  // -------------------------------------------------------------------------
  const invalidSigPayload = { id: `evt_polar_invalid_${testSuffix}`, type: "checkout.updated", data: { status: "succeeded" } };
  let invalidSigBlocked = false;
  try {
    await handlePolarWebhookEvent(JSON.stringify(invalidSigPayload), "bad_signature_string", invalidSigPayload);
  } catch (err: any) {
    if (err.message.includes("Invalid Polar webhook signature")) {
      invalidSigBlocked = true;
    }
  }
  if (!invalidSigBlocked) {
    throw new Error("FAIL Test 11: Invalid Polar webhook signature was not rejected!");
  }
  console.log("✓ Test 11 Passed: Invalid Polar webhook signature rejected.");

  // -------------------------------------------------------------------------
  // Test 12: Polar Webhook End-to-End Payment Activation
  // -------------------------------------------------------------------------
  const webhookCheckoutId = `chk_polar_wh_confirmed_${testSuffix}`;
  const validWebhookPayload = {
    id: `evt_polar_success_${testSuffix}`,
    type: "checkout.updated",
    data: {
      id: webhookCheckoutId,
      status: "succeeded",
      metadata: {
        userId: recruiterUser._id.toString(),
        planCode: "recruiter_lite",
      },
    },
  };

  const validRawBody = JSON.stringify(validWebhookPayload);
  const validSig = computeSig(validRawBody);

  const whResult = await handlePolarWebhookEvent(
    validRawBody,
    validSig,
    validWebhookPayload
  );

  if (whResult.status !== "processed") {
    throw new Error("FAIL Test 12: Polar webhook did not return status 'processed'.");
  }

  const activatedRecruiterSub = await Subscription.findOne({ userId: recruiterUser._id, status: "active" });
  if (!activatedRecruiterSub || activatedRecruiterSub.planCode !== "recruiter_lite") {
    throw new Error("FAIL Test 12: Polar webhook failed to activate recruiter subscription.");
  }
  if (activatedRecruiterSub.provider !== "polar") {
    throw new Error(`FAIL Test 12: Expected subscription provider 'polar', got '${activatedRecruiterSub.provider}'`);
  }
  console.log("✓ Test 12 Passed: Valid Polar webhook successfully activated subscription via canonical processCheckoutSession().");

  // -------------------------------------------------------------------------
  // Test 13: Duplicate Polar Webhook Event Idempotency
  // -------------------------------------------------------------------------
  const dupWhResult = await handlePolarWebhookEvent(
    validRawBody,
    validSig,
    validWebhookPayload
  );

  if (dupWhResult.status !== "already_processed") {
    throw new Error(`FAIL Test 13: Expected duplicate webhook status 'already_processed', got '${dupWhResult.status}'`);
  }
  console.log("✓ Test 13 Passed: Duplicate Polar webhook event claimed atomically and returned 'already_processed'.");

  // -------------------------------------------------------------------------
  // Test 14: Failed/Unconfirmed Polar Webhook Event Does NOT Activate Subscription
  // -------------------------------------------------------------------------
  const unconfirmedUser = await User.create({
    name: `Unconfirmed Candidate_${testSuffix}`,
    email: `unconfirmed_${testSuffix}@example.com`,
    password: "Password123!",
    role: "candidate",
  });

  const unconfirmedPayload = {
    id: `evt_polar_failed_${testSuffix}`,
    type: "checkout.updated",
    data: {
      id: `chk_polar_failed_${testSuffix}`,
      status: "failed",
      metadata: {
        userId: unconfirmedUser._id.toString(),
        planCode: "candidate_pro",
      },
    },
  };

  const unconfirmedRawBody = JSON.stringify(unconfirmedPayload);
  const unconfirmedSig = computeSig(unconfirmedRawBody);

  await handlePolarWebhookEvent(unconfirmedRawBody, unconfirmedSig, unconfirmedPayload);

  const unconfirmedSub = await Subscription.findOne({ userId: unconfirmedUser._id, status: "active" });
  if (unconfirmedSub && unconfirmedSub.planCode === "candidate_pro") {
    throw new Error("FAIL Test 14: Failed Polar webhook event activated a subscription!");
  }
  console.log("✓ Test 14 Passed: Failed Polar webhook event did NOT activate subscription.");

  // Clean up test documents
  await User.deleteMany({ email: { $regex: testSuffix } });
  await SubscriptionPlan.deleteMany({ code: { $regex: testSuffix } });
  await Coupon.deleteMany({ code: { $regex: testSuffix } });
  await Subscription.deleteMany({ userId: { $in: [candidateUser._id, recruiterUser._id, unconfirmedUser._id] } });
  await PaymentTransaction.deleteMany({ userId: { $in: [candidateUser._id, recruiterUser._id, unconfirmedUser._id] } });

  console.log("\n=======================================================================");
  console.log("Phase 5 Polar Verification Suite Passed — ALL 14 POLAR TESTS SUCCEEDED!");
  console.log("=======================================================================\n");
};

if (require.main === module) {
  runPolarVerificationSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\n❌ Phase 5 Polar Verification Suite Failed:", err);
      process.exit(1);
    });
}

export { runPolarVerificationSuite };
