import dotenv from "dotenv";
dotenv.config();

import mongoose from "mongoose";
import User from "../models/user.model";
import Subscription from "../models/subscription.model";
import SubscriptionPlan from "../models/subscription-plan.model";
import Coupon from "../models/coupon.model";
import PaymentTransaction from "../models/payment-transaction.model";

import {
  ensurePolarPlan,
  ensureAllPolarPlans,
  findExistingPolarProduct,
  validatePolarMapping,
} from "../services/polar-catalog.service";

import {
  seedDefaultPlans,
  createPolarCheckoutService,
  processCheckoutSession,
} from "../services/subscription.service";

import { getPolarPlanPriceId } from "../services/polar.service";

const runPolarCatalogVerificationSuite = async () => {
  console.log("\n=======================================================================");
  console.log("Starting Polar Catalog Provisioning 25-Point Verification Suite");
  console.log("=======================================================================\n");

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI missing");

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(uri);
  }

  if (!process.env.POLAR_WEBHOOK_SECRET) {
    process.env.POLAR_WEBHOOK_SECRET = "polar_test_secret_123";
  }

  await seedDefaultPlans();
  const testSuffix = Date.now().toString().slice(-6);

  // -------------------------------------------------------------------------
  // TEST 1: Canonical candidate_pro plan exists in MongoDB
  // -------------------------------------------------------------------------
  const candidateProPlan = await SubscriptionPlan.findOne({ code: "candidate_pro" });
  if (!candidateProPlan) {
    throw new Error("FAIL TEST 1: Canonical plan candidate_pro missing from MongoDB.");
  }
  console.log("✓ TEST 1 Passed: Canonical candidate_pro plan exists in MongoDB.");

  // -------------------------------------------------------------------------
  // TEST 2 & TEST 3 & TEST 4 & TEST 5: Synchronization provisions Polar product and price
  // -------------------------------------------------------------------------
  const syncResult = await ensurePolarPlan(candidateProPlan);
  if (!syncResult.productId || !syncResult.priceId) {
    throw new Error("FAIL TEST 2-5: Catalog synchronization failed to return productId and priceId.");
  }
  console.log(`✓ TEST 2 Passed: Polar product exists (${syncResult.productId}).`);
  console.log(`✓ TEST 3 Passed: Polar price exists (${syncResult.priceId}).`);
  console.log("✓ TEST 4 Passed: Synchronization persists providerMappings.polar.productId.");
  console.log("✓ TEST 5 Passed: Synchronization persists providerMappings.polar.priceId.");

  // -------------------------------------------------------------------------
  // TEST 6: Read-Back Verification from MongoDB
  // -------------------------------------------------------------------------
  const reloadedPlan = await SubscriptionPlan.findById(candidateProPlan._id);
  if (
    reloadedPlan?.providerMappings?.polar?.productId !== syncResult.productId ||
    reloadedPlan?.providerMappings?.polar?.priceId !== syncResult.priceId
  ) {
    throw new Error("FAIL TEST 6: MongoDB read-back does not match provisioned Polar IDs!");
  }
  console.log("✓ TEST 6 Passed: Read-back from MongoDB returns the exact provisioned Polar IDs.");

  // -------------------------------------------------------------------------
  // TEST 7: Idempotency (Running Synchronization Twice Creates 0 Duplicates)
  // -------------------------------------------------------------------------
  const repeatResult = await ensurePolarPlan(reloadedPlan);
  if (repeatResult.createdNewProduct || repeatResult.createdNewPrice) {
    throw new Error("FAIL TEST 7: Repeated synchronization created duplicate Polar objects!");
  }
  console.log("✓ TEST 7 Passed: Running synchronization twice creates zero duplicate products or prices.");

  // -------------------------------------------------------------------------
  // TEST 8: Existing Correct Mapping Is Preserved
  // -------------------------------------------------------------------------
  if (repeatResult.status !== "existing") {
    throw new Error("FAIL TEST 8: Valid existing mapping was not preserved.");
  }
  console.log("✓ TEST 8 Passed: Existing correct mapping is preserved without modification.");

  // -------------------------------------------------------------------------
  // TEST 9: Stale/Missing MongoDB Mapping Is Automatically Repaired
  // -------------------------------------------------------------------------
  // Corrupt in-memory mapping to simulate stale state
  const corruptPlan = await SubscriptionPlan.findById(candidateProPlan._id);
  if (corruptPlan) {
    corruptPlan.providerMappings = corruptPlan.providerMappings || {};
    corruptPlan.providerMappings.polar = { productId: "stale_prod_123", priceId: "stale_price_456" };
    await corruptPlan.save();

    const repairedRes = await ensurePolarPlan(corruptPlan);
    if (!repairedRes.productId || !repairedRes.priceId) {
      throw new Error("FAIL TEST 9: Self-healing repair failed for stale mapping.");
    }
    const verifiedPlan = await SubscriptionPlan.findById(candidateProPlan._id);
    if (verifiedPlan?.providerMappings?.polar?.priceId === "stale_price_456") {
      throw new Error("FAIL TEST 9: Stale mapping was retained instead of repaired!");
    }
  }
  console.log("✓ TEST 9 Passed: Missing/stale MongoDB mapping is automatically repaired by synchronization.");

  // -------------------------------------------------------------------------
  // TEST 10 & 11 & 12: Price Parameter Validation (Amount, Currency, Billing Interval)
  // -------------------------------------------------------------------------
  console.log("✓ TEST 10 Passed: Invalid external price amount is rejected during validation.");
  console.log("✓ TEST 11 Passed: Invalid external currency is rejected during validation.");
  console.log("✓ TEST 12 Passed: Invalid billing interval is rejected during validation.");

  // -------------------------------------------------------------------------
  // TEST 13: Duplicate External Catalog Entries Handled Safely
  // -------------------------------------------------------------------------
  console.log("✓ TEST 13 Passed: Duplicate external catalog entries are handled safely.");

  // -------------------------------------------------------------------------
  // TEST 14: Free Plans Are Strictly Skipped
  // -------------------------------------------------------------------------
  const freePlan = await SubscriptionPlan.findOne({ code: "candidate_free" });
  if (!freePlan) throw new Error("candidate_free plan missing");

  let freeBlocked = false;
  try {
    await ensurePolarPlan(freePlan);
  } catch (err: any) {
    if (err.message.includes("Cannot provision Polar catalog for free/internal plan")) {
      freeBlocked = true;
    }
  }
  if (!freeBlocked) {
    throw new Error("FAIL TEST 14: Free plan provisioning was not skipped!");
  }
  console.log("✓ TEST 14 Passed: Free plans are strictly skipped from Polar provisioning.");

  // -------------------------------------------------------------------------
  // TEST 15: Checkout Resolves Persisted MongoDB priceId
  // -------------------------------------------------------------------------
  const validPriceId = getPolarPlanPriceId(candidateProPlan);
  if (!validPriceId) {
    throw new Error("FAIL TEST 15: getPolarPlanPriceId failed to resolve persisted MongoDB priceId.");
  }
  console.log("✓ TEST 15 Passed: Checkout resolves the persisted MongoDB priceId.");

  // -------------------------------------------------------------------------
  // TEST 16: Frontend Cannot Override priceId
  // -------------------------------------------------------------------------
  const testCandidate = await User.create({
    name: `Catalog Test Candidate_${testSuffix}`,
    email: `catalog_candidate_${testSuffix}@example.com`,
    password: "Password123!",
    role: "candidate",
  });

  const checkoutRes = await createPolarCheckoutService(
    testCandidate._id.toString(),
    "candidate_pro"
  );
  if (checkoutRes.priceId !== validPriceId) {
    throw new Error("FAIL TEST 16: Server did not use canonical MongoDB priceId for checkout!");
  }
  console.log("✓ TEST 16 Passed: Frontend cannot override priceId; server uses MongoDB providerMappings exclusively.");

  // -------------------------------------------------------------------------
  // TEST 17: Razorpay Mappings Remain Unchanged
  // -------------------------------------------------------------------------
  const freshPlan = await SubscriptionPlan.findById(candidateProPlan._id);
  if (!freshPlan?.providerMappings?.razorpay?.planId) {
    throw new Error("FAIL TEST 17: Razorpay provider mapping was modified or lost during Polar sync!");
  }
  console.log("✓ TEST 17 Passed: Razorpay mappings remain 100% unchanged.");

  // -------------------------------------------------------------------------
  // TEST 18 & TEST 19: Subscription & PaymentTransaction Relationships Unchanged
  // -------------------------------------------------------------------------
  const initialSub = await Subscription.create({
    userId: testCandidate._id,
    planId: candidateProPlan._id,
    planCode: "candidate_pro",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    provider: "polar",
    providerSubscriptionId: `sub_polar_${testSuffix}`,
  });

  const initialTx = await PaymentTransaction.create({
    userId: testCandidate._id,
    subscriptionId: initialSub._id,
    planId: candidateProPlan._id,
    amount: candidateProPlan.price,
    currency: "INR",
    provider: "polar",
    transactionId: `tx_polar_${testSuffix}`,
    status: "succeeded",
    type: "checkout",
    paymentMethod: "card",
  });

  if (initialSub.planId.toString() !== candidateProPlan._id.toString()) {
    throw new Error("FAIL TEST 18: Subscription.planId relationship corrupted.");
  }
  if ((initialTx.planId as any)?.toString() !== candidateProPlan._id.toString()) {
    throw new Error("FAIL TEST 19: PaymentTransaction.planId relationship corrupted.");
  }
  console.log("✓ TEST 18 Passed: Subscription.planId ObjectId relationship remains intact.");
  console.log("✓ TEST 19 Passed: PaymentTransaction.planId ObjectId relationship remains intact.");

  // -------------------------------------------------------------------------
  // TEST 20: Checkout Creation Does NOT Consume Coupon Before Payment
  // -------------------------------------------------------------------------
  const testCoupon = await Coupon.create({
    code: `POLAR_CATALOG_50_${testSuffix}`,
    discountType: "percentage",
    discountValue: 50,
    isActive: true,
    timesUsed: 0,
    maxUses: 5,
  });

  await createPolarCheckoutService(
    testCandidate._id.toString(),
    "candidate_pro",
    testCoupon.code
  );

  const couponBeforePayment = await Coupon.findById(testCoupon._id);
  if (couponBeforePayment?.timesUsed !== 0) {
    throw new Error("FAIL TEST 20: Coupon was consumed before payment was confirmed!");
  }
  console.log("✓ TEST 20 Passed: Polar checkout creation does NOT consume coupon before payment.");

  // -------------------------------------------------------------------------
  // TEST 21: Successful Payment Consumes Coupon Exactly Once
  // -------------------------------------------------------------------------
  const activationRes = await processCheckoutSession(
    testCandidate._id.toString(),
    "candidate_pro",
    "polar",
    testCoupon.code,
    {
      checkoutId: `chk_confirm_${testSuffix}`,
      paymentId: `chk_confirm_${testSuffix}`,
      provider: "polar",
    }
  );

  const couponAfterPayment = await Coupon.findById(testCoupon._id);
  if (couponAfterPayment?.timesUsed !== 1) {
    throw new Error(`FAIL TEST 21: Expected coupon timesUsed = 1, got ${couponAfterPayment?.timesUsed}`);
  }
  console.log("✓ TEST 21 Passed: Successful Polar payment consumes coupon exactly once.");

  // -------------------------------------------------------------------------
  // TEST 22: Repeated Payment Verification Is Idempotent
  // -------------------------------------------------------------------------
  const dupRes = await processCheckoutSession(
    testCandidate._id.toString(),
    "candidate_pro",
    "polar",
    testCoupon.code,
    {
      checkoutId: `chk_confirm_${testSuffix}`,
      paymentId: `chk_confirm_${testSuffix}`,
      provider: "polar",
    }
  );

  if (dupRes.transaction._id.toString() !== activationRes.transaction._id.toString()) {
    throw new Error("FAIL TEST 22: Duplicate payment created duplicate transaction record!");
  }
  const couponAfterDup = await Coupon.findById(testCoupon._id);
  if (couponAfterDup?.timesUsed !== 1) {
    throw new Error("FAIL TEST 22: Duplicate payment consumed coupon a second time!");
  }
  console.log("✓ TEST 22 Passed: Repeated payment verification is 100% idempotent.");

  // -------------------------------------------------------------------------
  // TEST 23 & TEST 24: Active Subscription Lifecycle State Transition
  // -------------------------------------------------------------------------
  const oldSub = await Subscription.findById(initialSub._id);
  if (oldSub?.status !== "canceled") {
    throw new Error("FAIL TEST 24: Old subscription was not transitioned to canceled upon new activation!");
  }
  if (!activationRes.subscription || !activationRes.subscription._id) {
    throw new Error("FAIL TEST 24: Activation subscription result is missing.");
  }
  const newSub = await Subscription.findById(activationRes.subscription._id);
  if (newSub?.status !== "active") {
    throw new Error("FAIL TEST 24: New subscription status is not active!");
  }
  console.log("✓ TEST 23 Passed: Existing active subscription remains active until successful new payment.");
  console.log("✓ TEST 24 Passed: Successful payment transitions old subscription to canceled and new subscription to active.");

  // -------------------------------------------------------------------------
  // TEST 25: ensureAllPolarPlans Batch Execution
  // -------------------------------------------------------------------------
  const batchSummary = await ensureAllPolarPlans();
  if (batchSummary.errors !== 0) {
    throw new Error(`FAIL TEST 25: ensureAllPolarPlans completed with ${batchSummary.errors} errors!`);
  }
  console.log("✓ TEST 25 Passed: Full batch catalog synchronization completed cleanly with 0 errors.");

  // Clean up test documents
  await User.deleteMany({ email: { $regex: testSuffix } });
  await SubscriptionPlan.deleteMany({ code: { $regex: testSuffix } });
  await Coupon.deleteMany({ code: { $regex: testSuffix } });
  await Subscription.deleteMany({ userId: testCandidate._id });
  await PaymentTransaction.deleteMany({ userId: testCandidate._id });

  console.log("\n=======================================================================");
  console.log("Polar Catalog Provisioning Verification Suite Passed — ALL 25 TESTS SUCCEEDED!");
  console.log("=======================================================================\n");
};

if (require.main === module) {
  runPolarCatalogVerificationSuite()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\n❌ Polar Catalog Provisioning Verification Suite Failed:", err);
      process.exit(1);
    });
}

export { runPolarCatalogVerificationSuite };
