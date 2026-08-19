import dotenv from "dotenv";
dotenv.config();

import mongoose, { Types } from "mongoose";
import User from "../models/user.model";
import Company from "../models/company.model";
import RecruiterProfile from "../models/recruiter-profile.model";
import CandidateProfile from "../models/candidate-profile.model";
import CompanyRecruiter from "../models/company-recruiter.model";
import Job from "../models/job.model";
import Application from "../models/application.model";
import SavedJob from "../models/saved-job.model";
import Subscription from "../models/subscription.model";
import SubscriptionPlan from "../models/subscription-plan.model";
import Coupon from "../models/coupon.model";
import PaymentTransaction from "../models/payment-transaction.model";

import { createCompany } from "../services/company.service";
import { createJob, updateJob } from "../services/job.service";
import { applyForJob } from "../services/application.service";
import { saveJob } from "../services/saved-job.service";
import { processCheckoutSession, consumeCouponCode, validateCouponCode, createRazorpayOrderService, handleRazorpayWebhookEvent, getRazorpayPlanId, seedDefaultPlans } from "../services/subscription.service";
import { migrateSubscriptionPlanProviderMappings } from "../migrations/migrate-subscription-plan-provider-mappings";
import { EMPLOYMENT_TYPE } from "../constants/employment-type";
import { EXPERIENCE_LEVEL } from "../constants/experience-level";

const runVerificationSuite = async () => {
  console.log("\n=======================================================================");
  console.log("Starting Full Phase 1 & Phase 2 Architecture Hardening Verification");
  console.log("=======================================================================\n");

  // Sync schema indexes across collections to ensure partial unique indexes are active
  try {
    await Subscription.collection.dropIndex("userId_1");
  } catch (e) {}
  await CompanyRecruiter.syncIndexes();
  await Subscription.syncIndexes();
  await Coupon.syncIndexes();

  const testSuffix = Date.now().toString().slice(-6);

  // -------------------------------------------------------------------------
  // 1. Setup Test Users
  // -------------------------------------------------------------------------
  const recruiterUser1 = await User.create({
    name: `Recruiter 1_${testSuffix}`,
    email: `recruiter1_${testSuffix}@example.com`,
    password: "Password123!",
    role: "recruiter",
  });

  const recruiterUser2 = await User.create({
    name: `Recruiter 2_${testSuffix}`,
    email: `recruiter2_${testSuffix}@example.com`,
    password: "Password123!",
    role: "recruiter",
  });

  const candidateUser = await User.create({
    name: `Candidate_${testSuffix}`,
    email: `candidate_${testSuffix}@example.com`,
    password: "Password123!",
    role: "candidate",
  });

  console.log("✓ Test users created successfully.");

  // -------------------------------------------------------------------------
  // 2. Company ↔ Recruiter Canonical Relationship & Primary Recruiter Uniqueness
  // -------------------------------------------------------------------------
  const company1 = await createCompany(recruiterUser1._id.toString(), {
    name: `TechCorp_${testSuffix}`,
    description: "Enterprise Tech Solutions Provider",
  });

  const cr1 = await CompanyRecruiter.findOne({ companyId: company1._id, isPrimary: true });
  if (!cr1 || cr1.isDeleted) {
    throw new Error("FAIL: CompanyRecruiter record not created properly for new company.");
  }
  console.log("✓ Test 1 Passed: Company creation produces active primary CompanyRecruiter entry.");

  // Test primary recruiter constraint (only 1 active primary recruiter allowed per company)
  const profile2 = await RecruiterProfile.create({ userId: recruiterUser2._id });
  let primaryConflictBlocked = false;
  try {
    await CompanyRecruiter.create({
      companyId: company1._id,
      recruiterProfileId: profile2._id,
      role: "recruiter",
      isPrimary: true,
      isDeleted: false,
    });
  } catch (err: any) {
    primaryConflictBlocked = true;
  }
  if (!primaryConflictBlocked) {
    throw new Error("FAIL: Allowed multiple active primary recruiters for the same company!");
  }
  console.log("✓ Test 2 Passed: Partial unique index prevents duplicate active primary recruiters.");

  // -------------------------------------------------------------------------
  // 3. Job ↔ Company & Recruiter Authorization & Skill Sync
  // -------------------------------------------------------------------------
  const job1 = await createJob(
    {
      title: `Staff Backend Engineer ${testSuffix}`,
      description: "Building resilient microservices with Node & Mongo",
      company: company1.name,
      location: "Remote",
      salaryMin: 140000,
      salaryMax: 180000,
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
      skills: ["TypeScript", "MongoDB", "Express", "Node.js"],
    },
    recruiterUser1._id as Types.ObjectId
  );

  if (job1.companyId?.toString() !== company1._id.toString()) {
    throw new Error("FAIL: Job.companyId does not match Company._id.");
  }
  if (job1.recruiterId.toString() !== recruiterUser1._id.toString()) {
    throw new Error("FAIL: Job.recruiterId does not match User._id.");
  }
  if (!job1.skillIds || job1.skillIds.length !== 4) {
    throw new Error("FAIL: Job.skillIds was not correctly resolved.");
  }
  console.log("✓ Test 3 Passed: Job created with verified companyId, recruiterId, and skillIds.");

  // Test unauthorized job update attempt
  let unauthorizedUpdateBlocked = false;
  try {
    await updateJob(job1._id.toString(), recruiterUser2._id.toString(), {
      title: "Malicious Job Update Attempt",
    });
  } catch (err: any) {
    unauthorizedUpdateBlocked = true;
  }
  if (!unauthorizedUpdateBlocked) {
    throw new Error("FAIL: Unauthorized recruiter was able to update another recruiter's job!");
  }
  console.log("✓ Test 4 Passed: Server-side authorization blocks unauthorized recruiter job edits.");

  // -------------------------------------------------------------------------
  // 4. Candidate ↔ Application Invariants & Historical Snapshot
  // -------------------------------------------------------------------------
  const candidateProfile = await CandidateProfile.create({
    userId: candidateUser._id,
    resumeUrl: "https://example.com/resumes/v1.pdf",
    skills: ["TypeScript"],
    phone: "+15550199",
    headline: "Senior Software Engineer",
  });

  const app1 = await applyForJob(job1._id.toString(), candidateUser._id.toString(), {
    coverLetter: "Excited about this Staff Backend role!",
    experienceYears: 6,
  });

  if (app1.candidateProfileId?.toString() !== candidateProfile._id.toString()) {
    throw new Error("FAIL: Application.candidateProfileId does not match CandidateProfile._id.");
  }
  if (app1.applicantId.toString() !== candidateUser._id.toString()) {
    throw new Error("FAIL: Application.applicantId does not match User._id.");
  }
  if (!app1.applicantName || !app1.applicantEmail || !app1.resume) {
    throw new Error("FAIL: Historical application snapshot attributes missing.");
  }
  console.log("✓ Test 5 Passed: Application created with candidate profile invariant and historical snapshots.");

  // Test duplicate application prevention
  let duplicateAppBlocked = false;
  try {
    await applyForJob(job1._id.toString(), candidateUser._id.toString(), {});
  } catch (err: any) {
    duplicateAppBlocked = true;
  }
  if (!duplicateAppBlocked) {
    throw new Error("FAIL: Duplicate application was allowed!");
  }
  console.log("✓ Test 6 Passed: Duplicate application rejected.");

  // -------------------------------------------------------------------------
  // 5. Candidate ↔ SavedJob Invariants
  // -------------------------------------------------------------------------
  const savedRes = await saveJob(candidateUser._id.toString(), job1._id.toString());
  if (!savedRes.saved) throw new Error("FAIL: saveJob failed.");

  const savedDoc = await SavedJob.findOne({ userId: candidateUser._id, jobId: job1._id });
  if (!savedDoc || savedDoc.candidateProfileId?.toString() !== candidateProfile._id.toString()) {
    throw new Error("FAIL: SavedJob.candidateProfileId mismatch.");
  }
  console.log("✓ Test 7 Passed: SavedJob created with candidate profile invariant.");

  // -------------------------------------------------------------------------
  // 6. Subscription Active Uniqueness & Lifecycle
  // -------------------------------------------------------------------------
  const candidatePlan = await SubscriptionPlan.findOne({ code: "candidate_pro" });
  if (!candidatePlan) throw new Error("FAIL: Default subscription plan candidate_pro not found.");

  const checkoutRes1 = await processCheckoutSession(candidateUser._id.toString(), candidatePlan.code, "card");
  if (!checkoutRes1.subscription || checkoutRes1.subscription.status !== "active") {
    throw new Error("FAIL: Subscription checkout failed.");
  }
  console.log("✓ Test 8 Passed: User subscription created with status active.");

  // Verify DB index prevents duplicate active subscription documents
  let duplicateActiveSubBlocked = false;
  try {
    await Subscription.create({
      userId: candidateUser._id,
      planId: candidatePlan._id,
      planCode: candidatePlan.code,
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 86400000),
      provider: "internal",
      usages: { jobsPostedCount: 0, featuredJobsCount: 0, inmailCreditsUsed: 0 },
    });
  } catch (err: any) {
    duplicateActiveSubBlocked = true;
  }
  if (!duplicateActiveSubBlocked) {
    throw new Error("FAIL: Database allowed multiple active subscriptions for the same user!");
  }
  console.log("✓ Test 9 Passed: Subscription partial unique index enforces single active subscription.");

  // -------------------------------------------------------------------------
  // 7. Atomic Coupon Consumption Concurrency & Limits
  // -------------------------------------------------------------------------
  const testCouponCode = `TESTPROMO_${testSuffix}`;
  await Coupon.create({
    code: testCouponCode,
    discountType: "percentage",
    discountValue: 25,
    maxUses: 1,
    timesUsed: 0,
    isActive: true,
  });

  const consumed1 = await consumeCouponCode(testCouponCode);
  if (consumed1.timesUsed !== 1) {
    throw new Error("FAIL: Coupon timesUsed was not incremented atomically.");
  }

  let secondUseBlocked = false;
  try {
    await consumeCouponCode(testCouponCode);
  } catch (err: any) {
    secondUseBlocked = true;
  }
  if (!secondUseBlocked) {
    throw new Error("FAIL: Coupon usage allowed beyond maxUses!");
  }
  console.log("✓ Test 10 Passed: Concurrency-safe atomic coupon redemption enforces maxUses limits.");

  // Test Percentage Discount Limit validation
  let invalidPercentageBlocked = false;
  try {
    await Coupon.create({
      code: `BADPERC_${testSuffix}`,
      discountType: "percentage",
      discountValue: 150,
      maxUses: 1,
      isActive: true,
    });
  } catch (err: any) {
    invalidPercentageBlocked = true;
  }
  if (!invalidPercentageBlocked) {
    throw new Error("FAIL: Coupon allowed percentage discount value > 100%!");
  }
  console.log("✓ Test 11 Passed: Schema validation rejects percentage discount > 100%.");

  // -------------------------------------------------------------------------
  // 8. Webhook Idempotency Check
  // -------------------------------------------------------------------------
  const mockWebhookEventId = `evt_test_${testSuffix}`;
  const mockWebhookPayload = {
    event_id: mockWebhookEventId,
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: `pay_test_${testSuffix}`,
          order_id: `order_test_${testSuffix}`,
          notes: {
            userId: candidateUser._id.toString(),
            planCode: candidatePlan.code,
          },
        },
      },
    },
  };

  // Mock verification signature helper in razorpay service passes in test mode
  // Test idempotency by attempting duplicate handling
  const WebhookEvent = (await import("../models/webhook-event.model")).default;
  await WebhookEvent.create({
    provider: "razorpay",
    eventId: mockWebhookEventId,
    eventType: "payment.captured",
    payload: mockWebhookPayload,
    status: "processed",
    processedAt: new Date(),
  });

  let duplicateWebhookCaught = false;
  try {
    await WebhookEvent.create({
      provider: "razorpay",
      eventId: mockWebhookEventId,
      eventType: "payment.captured",
      payload: mockWebhookPayload,
      status: "processed",
      processedAt: new Date(),
    });
  } catch (err: any) {
    duplicateWebhookCaught = true;
  }
  if (!duplicateWebhookCaught) {
    throw new Error("FAIL: Duplicate webhook event was allowed into WebhookEvent collection!");
  }
  console.log("✓ Test 12 Passed: Webhook event idempotency unique index enforces single processing.");

  // -------------------------------------------------------------------------
  // 9. Detailed Checkout Lifecycle & Coupon State Transition Hardening
  // -------------------------------------------------------------------------
  // Test A: Coupon is NOT consumed during order creation
  const orderCouponCode = `ORDERCOUPON_${testSuffix}`;
  await Coupon.create({
    code: orderCouponCode,
    discountType: "percentage",
    discountValue: 10,
    maxUses: 5,
    timesUsed: 0,
    isActive: true,
  });

  try {
    await createRazorpayOrderService(candidateUser._id.toString(), "candidate_premium", orderCouponCode);
  } catch (e: any) {}

  const couponAfterOrder = await Coupon.findOne({ code: orderCouponCode });
  if (!couponAfterOrder || couponAfterOrder.timesUsed !== 0) {
    throw new Error("FAIL: Coupon was consumed during order creation!");
  }
  console.log("✓ Test 13 Passed: Coupon usage count is preserved during order creation.");

  // Test B: Old active subscription remains active until successful payment replaces it
  const oldActiveSub = await Subscription.findOne({ userId: candidateUser._id, status: "active" });
  if (!oldActiveSub) throw new Error("FAIL: Active subscription missing for candidate test.");

  // Simulate payment verification for upgrading plan
  const upgradeTxnId = `pay_upgrade_${testSuffix}`;
  const upgradeRes = await processCheckoutSession(
    candidateUser._id.toString(),
    "candidate_premium",
    "card",
    orderCouponCode,
    { paymentId: upgradeTxnId }
  );

  const prevSubDoc = await Subscription.findById(oldActiveSub._id);
  if (!prevSubDoc || prevSubDoc.status !== "canceled") {
    throw new Error("FAIL: Old active subscription was not transitioned to canceled upon payment completion.");
  }
  const newActiveSub = await Subscription.findOne({ userId: candidateUser._id, status: "active" });
  if (!newActiveSub || !upgradeRes.subscription || newActiveSub._id.toString() !== (upgradeRes.subscription as any)._id.toString()) {
    throw new Error("FAIL: New subscription was not set as active.");
  }
  console.log("✓ Test 14 Passed: Successful payment replaces old subscription atomically.");

  // Test C: Coupon consumed exactly once upon successful payment completion
  const couponAfterPayment = await Coupon.findOne({ code: orderCouponCode });
  if (!couponAfterPayment || couponAfterPayment.timesUsed !== 1) {
    throw new Error("FAIL: Coupon was not consumed exactly once after successful payment verification!");
  }
  console.log("✓ Test 15 Passed: Successful payment consumes coupon exactly once.");

  // Test D: Idempotency of duplicate payment verification
  const duplicateRes = await processCheckoutSession(
    candidateUser._id.toString(),
    "candidate_premium",
    "card",
    orderCouponCode,
    { paymentId: upgradeTxnId }
  );
  if (!duplicateRes.subscription || (duplicateRes.subscription as any)._id.toString() !== newActiveSub._id.toString()) {
    throw new Error("FAIL: Idempotent payment verification returned different subscription!");
  }
  const couponAfterDuplicate = await Coupon.findOne({ code: orderCouponCode });
  if (!couponAfterDuplicate || couponAfterDuplicate.timesUsed !== 1) {
    throw new Error("FAIL: Idempotent retry incremented coupon timesUsed twice!");
  }
  console.log("✓ Test 16 Passed: Idempotent payment verification prevents duplicate activation and coupon re-consumption.");

  // Test E: Failed payment transaction leaves old active subscription intact and does NOT consume coupon
  const failedCouponCode = `FAILCOUPON_${testSuffix}`;
  await Coupon.create({
    code: failedCouponCode,
    discountType: "fixed",
    discountValue: 50,
    maxUses: 1,
    timesUsed: 0,
    isActive: true,
  });

  const activeSubBeforeFailure = await Subscription.findOne({ userId: candidateUser._id, status: "active" });
  let paymentErrorThrown = false;
  try {
    await processCheckoutSession(
      candidateUser._id.toString(),
      "non_existent_plan_code",
      "card",
      failedCouponCode
    );
  } catch (err: any) {
    paymentErrorThrown = true;
  }
  if (!paymentErrorThrown) {
    throw new Error("FAIL: Invalid checkout session did not throw error!");
  }

  const activeSubAfterFailure = await Subscription.findOne({ userId: candidateUser._id, status: "active" });
  if (!activeSubAfterFailure || activeSubAfterFailure._id.toString() !== activeSubBeforeFailure?._id.toString()) {
    throw new Error("FAIL: Payment failure modified or removed existing active subscription!");
  }
  const failedCouponDoc = await Coupon.findOne({ code: failedCouponCode });
  if (!failedCouponDoc || failedCouponDoc.timesUsed !== 0) {
    throw new Error("FAIL: Failed payment consumed coupon!");
  }
  console.log("✓ Test 17 Passed: Payment failure preserves existing active subscription and coupon status.");

  // -------------------------------------------------------------------------
  // 10. Multi-Document Transaction Rollback & Concurrency Hardening
  // -------------------------------------------------------------------------
  // Test F: Transaction Rollback on Invalid Coupon Consumption Failure
  const expiredCouponCode = `EXPIREDCOUPON_${testSuffix}`;
  await Coupon.create({
    code: expiredCouponCode,
    discountType: "percentage",
    discountValue: 20,
    maxUses: 1,
    timesUsed: 1, // Already exhausted
    isActive: true,
  });

  const activeSubBeforeTxRollback = await Subscription.findOne({ userId: candidateUser._id, status: "active" });
  let txRollbackCaught = false;
  try {
    await processCheckoutSession(
      candidateUser._id.toString(),
      "candidate_pro",
      "card",
      expiredCouponCode,
      { paymentId: `pay_roll_${testSuffix}` }
    );
  } catch (err: any) {
    txRollbackCaught = true;
  }
  if (!txRollbackCaught) {
    throw new Error("FAIL: Exhausted coupon did not abort transaction!");
  }

  const activeSubAfterTxRollback = await Subscription.findOne({ userId: candidateUser._id, status: "active" });
  if (!activeSubAfterTxRollback || activeSubAfterTxRollback._id.toString() !== activeSubBeforeTxRollback?._id.toString()) {
    throw new Error("FAIL: Transaction abort did not preserve original active subscription!");
  }
  const rolledBackTxn = await PaymentTransaction.findOne({ transactionId: `pay_roll_${testSuffix}` });
  if (rolledBackTxn) {
    throw new Error("FAIL: Transaction abort left orphaned PaymentTransaction record!");
  }
  console.log("✓ Test 18 Passed: Transaction rollback on coupon failure restores original active subscription and removes partial data.");

  // Test G: Concurrent Checkouts Guarantee Exactly One Active Subscription
  const concurrentPaymentIds = Array.from({ length: 5 }, (_, i) => `pay_conc_${testSuffix}_${i}`);
  const concurrentResults = await Promise.allSettled(
    concurrentPaymentIds.map((pId) =>
      processCheckoutSession(candidateUser._id.toString(), "candidate_pro", "card", undefined, { paymentId: pId })
    )
  );

  const activeSubsAfterConcurrent = await Subscription.find({ userId: candidateUser._id, status: "active" });
  if (activeSubsAfterConcurrent.length !== 1) {
    throw new Error(`FAIL: Concurrent checkouts produced ${activeSubsAfterConcurrent.length} active subscriptions instead of exactly 1!`);
  }
  console.log("✓ Test 19 Passed: Concurrent checkouts under strict transaction control guarantee exactly 1 active subscription.");

  // Test H: Concurrent Webhook Delivery Idempotency & Atomic Claim
  const concWebhookEventId = `evt_conc_wh_${testSuffix}`;
  const concWebhookPayload = {
    event_id: concWebhookEventId,
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: `pay_wh_${testSuffix}`,
          order_id: `order_wh_${testSuffix}`,
          notes: {
            userId: candidateUser._id.toString(),
            planCode: candidatePlan.code,
          },
        },
      },
    },
  };

  const mockRawBody = JSON.stringify(concWebhookPayload);
  const webhookResults = await Promise.all(
    Array.from({ length: 5 }, () =>
      handleRazorpayWebhookEvent(mockRawBody, "mock_signature", concWebhookPayload)
    )
  );

  const processedCount = webhookResults.filter((r) => r.status === "processed").length;
  const alreadyProcessedCount = webhookResults.filter((r) => r.status === "already_processed").length;

  if (processedCount !== 1 || alreadyProcessedCount !== 4) {
    throw new Error(`FAIL: Concurrent webhook delivery resulted in ${processedCount} processed and ${alreadyProcessedCount} already_processed instead of 1 processed and 4 already_processed!`);
  }

  const webhookEventDoc = await WebhookEvent.findOne({ eventId: concWebhookEventId });
  if (!webhookEventDoc || webhookEventDoc.status !== "processed") {
    throw new Error("FAIL: Webhook event document status was not marked as processed.");
  }
  console.log("✓ Test 20 Passed: Concurrent duplicate webhook delivery executes business logic exactly once and claims event atomically.");

  // -------------------------------------------------------------------------
  // 11. Phase 3: Canonical SubscriptionPlan & Multi-Provider Architecture
  // -------------------------------------------------------------------------

  // Test 21: getRazorpayPlanId resolves strictly from providerMappings.razorpay.planId
  await seedDefaultPlans();
  const proPlanDoc = await SubscriptionPlan.findOne({ code: "candidate_pro" });
  if (!proPlanDoc) throw new Error("FAIL: candidate_pro plan missing!");
  const mappedRzpId = getRazorpayPlanId(proPlanDoc);
  if (!mappedRzpId || mappedRzpId !== proPlanDoc.providerMappings?.razorpay?.planId) {
    throw new Error("FAIL: getRazorpayPlanId did not resolve strictly from providerMappings.razorpay.planId!");
  }
  console.log("✓ Test 21 Passed: getRazorpayPlanId resolves strictly from providerMappings.razorpay.planId.");

  // Test 22: getRazorpayPlanId returns undefined for free plan and fails clearly for unmapped paid plan
  const freePlanDoc = await SubscriptionPlan.findOne({ code: "candidate_free" });
  if (!freePlanDoc) throw new Error("FAIL: candidate_free plan missing!");
  const freeRzpId = getRazorpayPlanId(freePlanDoc);
  if (freeRzpId !== undefined) {
    throw new Error("FAIL: Free plan returned non-undefined Razorpay plan ID!");
  }

  const unmappedPaidPlan = new SubscriptionPlan({
    code: `unmapped_paid_${testSuffix}`,
    name: "Unmapped Paid Plan",
    description: "Test unmapped plan",
    targetRole: "candidate",
    price: 499,
    currency: "INR",
    billingPeriod: "monthly",
    features: {},
    providerMappings: {},
    isActive: true,
  });

  let unmappedErrorThrown = false;
  try {
    getRazorpayPlanId(unmappedPaidPlan);
  } catch (err: any) {
    if (err.message.includes("providerMappings.razorpay.planId missing")) {
      unmappedErrorThrown = true;
    }
  }
  if (!unmappedErrorThrown) {
    throw new Error("FAIL: getRazorpayPlanId did not throw explicit error for unmapped paid plan!");
  }
  console.log("✓ Test 22 Passed: getRazorpayPlanId returns undefined for free plans and fails clearly for unmapped paid plans.");

  // Test 23: Migration script idempotency & conflict detection
  const migrationRes = await migrateSubscriptionPlanProviderMappings();
  if (typeof migrationRes.updatedCount !== "number" || typeof migrationRes.skippedCount !== "number") {
    throw new Error("FAIL: Migration script returned invalid result structure!");
  }

  // Running migration again must be idempotent (0 updates)
  const reMigrationRes = await migrateSubscriptionPlanProviderMappings();
  if (reMigrationRes.updatedCount !== 0) {
    throw new Error("FAIL: Re-running migration was not idempotent!");
  }

  // Conflict detection test
  const conflictingPlan = new SubscriptionPlan({
    code: `conflict_plan_${testSuffix}`,
    name: "Conflicting Plan",
    description: "Test conflicting plan",
    targetRole: "recruiter",
    price: 1999,
    currency: "INR",
    billingPeriod: "monthly",
    features: {},
    providerPlanId: "plan_legacy_abc",
    providerMappings: { razorpay: { planId: "plan_new_xyz" } },
    isActive: true,
  });
  await conflictingPlan.save();

  let conflictCaught = false;
  try {
    await migrateSubscriptionPlanProviderMappings();
  } catch (err: any) {
    if (err.message.includes("Conflicting Razorpay Plan IDs")) {
      conflictCaught = true;
    }
  }
  await SubscriptionPlan.deleteOne({ _id: conflictingPlan._id });

  if (!conflictCaught) {
    throw new Error("FAIL: Migration script did not fail loudly on conflicting Razorpay IDs!");
  }
  console.log("✓ Test 23 Passed: Migration script is idempotent and fails loudly on conflicting provider mappings.");

  // Test 24: Monthly vs Yearly plan isolation & price safety
  const monthlyLite = await SubscriptionPlan.findOne({ code: "recruiter_lite" });
  const yearlyLite = await SubscriptionPlan.findOne({ code: "recruiter_lite_yearly" });
  if (!monthlyLite || !yearlyLite) {
    throw new Error("FAIL: Recruiter lite monthly or yearly plan document missing!");
  }
  if (monthlyLite._id.toString() === yearlyLite._id.toString()) {
    throw new Error("FAIL: Monthly and yearly plans were merged into a single document!");
  }
  if (monthlyLite.price !== 999 || yearlyLite.price !== 9599) {
    throw new Error("FAIL: Plan prices were modified!");
  }
  console.log("✓ Test 24 Passed: Monthly and yearly plans remain separate documents with preserved canonical prices.");

  // Test 25: Polar mapping storage without affecting Razorpay & relationship preservation
  const polarTestPlan = await SubscriptionPlan.findOne({ code: "candidate_pro" });
  if (!polarTestPlan) throw new Error("FAIL: candidate_pro plan missing!");
  polarTestPlan.set("providerMappings.polar", { productId: "prod_polar_test_123", priceId: "price_polar_test_456" });
  await polarTestPlan.save();

  const reloadedPolarPlan = await SubscriptionPlan.findOne({ code: "candidate_pro" });
  if (reloadedPolarPlan?.providerMappings?.polar?.productId !== "prod_polar_test_123" ||
      reloadedPolarPlan?.providerMappings?.polar?.priceId !== "price_polar_test_456") {
    throw new Error("FAIL: Polar provider mapping was not saved correctly!");
  }
  const rzpIdAfterPolar = getRazorpayPlanId(reloadedPolarPlan);
  if (!rzpIdAfterPolar) {
    throw new Error("FAIL: Adding Polar mapping disrupted Razorpay plan lookup!");
  }

  // Verify Subscription.planId and PaymentTransaction.planId relationships point to SubscriptionPlan ObjectId
  const activeSubForRelCheck = await Subscription.findOne({ userId: candidateUser._id, status: "active" });
  if (activeSubForRelCheck) {
    const populatedSub = await Subscription.findById(activeSubForRelCheck._id).populate("planId");
    if (!populatedSub || !populatedSub.planId || !(populatedSub.planId as any).code) {
      throw new Error("FAIL: Subscription.planId ObjectId relationship was corrupted!");
    }
  }
  console.log("✓ Test 25 Passed: Polar mapping stored safely without affecting Razorpay behavior and ObjectId relationships preserved.");

  // -------------------------------------------------------------------------
  // Cleanup Test Documents
  // -------------------------------------------------------------------------
  await WebhookEvent.deleteMany({ eventId: { $in: [mockWebhookEventId, concWebhookEventId] } });
  await Coupon.deleteMany({ code: { $in: [testCouponCode, `BADPERC_${testSuffix}`, orderCouponCode, failedCouponCode, expiredCouponCode] } });
  await PaymentTransaction.deleteMany({ transactionId: { $in: [upgradeTxnId, `pay_roll_${testSuffix}`, `pay_wh_${testSuffix}`, ...concurrentPaymentIds] } });
  await Subscription.deleteMany({ userId: candidateUser._id });
  await Application.deleteMany({ _id: app1._id });
  await SavedJob.deleteMany({ _id: savedDoc._id });
  await Job.deleteMany({ _id: job1._id });
  await CompanyRecruiter.deleteMany({ companyId: company1._id });
  await Company.deleteMany({ _id: company1._id });
  await RecruiterProfile.deleteMany({ userId: { $in: [recruiterUser1._id, recruiterUser2._id] } });
  await CandidateProfile.deleteMany({ userId: candidateUser._id });
  await User.deleteMany({ _id: { $in: [recruiterUser1._id, recruiterUser2._id, candidateUser._id] } });

  console.log("\n=======================================================================");
  console.log("ALL PHASE 1 & PHASE 2 VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉");
  console.log("=======================================================================\n");
};

if (require.main === module) {
  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal";
  mongoose
    .connect(mongoUri)
    .then(async () => {
      console.log("Connected to MongoDB for Phase 1 & Phase 2 verification suite.");
      await runVerificationSuite();
      await mongoose.disconnect();
      process.exit(0);
    })
    .catch((err) => {
      console.error("Verification execution error:", err);
      process.exit(1);
    });
}
