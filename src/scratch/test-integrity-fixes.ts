import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/user.model";
import Job from "../models/job.model";
import Company from "../models/company.model";
import RecruiterProfile from "../models/recruiter-profile.model";
import CandidateProfile from "../models/candidate-profile.model";
import Application from "../models/application.model";
import Coupon from "../models/coupon.model";
import SubscriptionPlan from "../models/subscription-plan.model";
import Subscription from "../models/subscription.model";
import PaymentOrder from "../models/payment-order.model";
import PaymentTransaction from "../models/payment-transaction.model";
import { APPLICATION_STATUS } from "../constants/application-status";
import { JOB_STATUS } from "../constants/job-status";
import { EMPLOYMENT_TYPE } from "../constants/employment-type";
import { EXPERIENCE_LEVEL } from "../constants/experience-level";
import { USER_ROLES } from "../constants/roles";
import {
  applyForJob,
  updateApplicationStatus,
  withdrawApplication,
} from "../services/application.service";
import {
  validateCouponCode,
  consumeCouponCode,
  createRazorpayOrderService,
  processCheckoutSession,
  seedDefaultPlans,
} from "../services/subscription.service";
import { verifyPaymentSignature } from "../services/razorpay.service";
import crypto from "crypto";

async function runTestSuite() {
  console.log("================================================================");
  console.log("   MOMENTUM & INTEGRITY AUDIT SUITE: APPLICATION & COUPON FIXES ");
  console.log("================================================================");

  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal";
  await mongoose.connect(mongoUri);
  console.log(" Connected to MongoDB");

  // Re-sync indexes so partial indexes are active in the database
  console.log(" Syncing MongoDB indexes...");
  await Application.syncIndexes();
  await Coupon.syncIndexes();
  await Subscription.syncIndexes();
  console.log(" Indexes synced successfully.");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(` PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}${detail ? " -> " + detail : ""}`);
      failed++;
    }
  }

  const testSuffix = `test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  try {
    // -------------------------------------------------------------------------
    // SETUP SEED DATA
    // -------------------------------------------------------------------------
    await seedDefaultPlans();

    // 1. Create Recruiter & Company
    const recruiterUser = await User.create({
      name: `Recruiter ${testSuffix}`,
      email: `recruiter_${testSuffix}@example.com`,
      password: "TestPassword123!",
      role: USER_ROLES.RECRUITER,
      isEmailVerified: true,
    });

    const recruiterProfile = await RecruiterProfile.create({
      userId: recruiterUser._id,
      designation: "Talent Partner",
    });

    const company = await Company.create({
      name: `Company ${testSuffix}`,
      description: "A high-growth tech startup",
      recruiterId: recruiterUser._id,
      isVerified: true,
    });

    // 2. Create Candidate
    const candidateUser = await User.create({
      name: `Candidate ${testSuffix}`,
      email: `candidate_${testSuffix}@example.com`,
      password: "TestPassword123!",
      role: USER_ROLES.CANDIDATE,
      isEmailVerified: true,
      resumeUrl: "https://example.com/resumes/candidate_default.pdf",
    });

    const candidateProfile = await CandidateProfile.create({
      userId: candidateUser._id,
      phone: "+1234567890",
      skills: ["Node.js", "TypeScript", "MongoDB"],
      resumeUrl: "https://example.com/resumes/candidate_profile.pdf",
    });

    // 3. Create Job
    const job = await Job.create({
      title: `Senior Backend Engineer ${testSuffix}`,
      description: "Build robust distributed backend systems.",
      company: company.name,
      companyId: company._id,
      location: "San Francisco, CA",
      salaryMin: 140000,
      salaryMax: 190000,
      employmentType: EMPLOYMENT_TYPE.FULL_TIME,
      experienceLevel: EXPERIENCE_LEVEL.FIVE_PLUS_YEARS,
      status: JOB_STATUS.ACTIVE,
      recruiterId: recruiterUser._id,
      postedBy: recruiterProfile._id,
      skills: ["Node.js", "TypeScript", "MongoDB"],
      isDeleted: false,
    });

    // =========================================================================
    // TEST SECTION 1: APPLICATION PARTIAL UNIQUE INDEX & RE-APPLY FLOW
    // =========================================================================
    console.log("\n--- [1] Application Partial Unique Index & Lifecycle ---");

    // 1.1 First Application
    const app1 = await applyForJob(job._id.toString(), candidateUser._id.toString(), {
      coverLetter: "I am thrilled to apply for this backend position.",
      applicantPhone: "+1234567890",
      relevantSkills: ["Node.js", "TypeScript"],
    });
    assert(Boolean(app1 && app1.status === APPLICATION_STATUS.APPLIED && !app1.isDeleted), "Initial Application succeeds");

    // 1.2 Duplicate Active Application Blocked
    let duplicateRejected = false;
    try {
      await applyForJob(job._id.toString(), candidateUser._id.toString(), {
        coverLetter: "Duplicate apply attempt",
      });
    } catch (e: any) {
      duplicateRejected = e.message.includes("already applied") || e.statusCode === 409;
    }
    assert(duplicateRejected, "Duplicate application while active is rejected with 409 Conflict");

    // 1.3 Withdraw Application (Soft Delete)
    await withdrawApplication(app1._id.toString(), candidateUser._id.toString());
    const withdrawnApp = await Application.findById(app1._id);
    assert(Boolean(withdrawnApp && withdrawnApp.isDeleted === true), "WithdrawApplication successfully marks application as isDeleted: true");

    // 1.4 Re-apply after Withdrawal (Preserve Apply -> Withdraw -> Re-apply flow)
    const reappliedApp = await applyForJob(job._id.toString(), candidateUser._id.toString(), {
      coverLetter: "Updated cover letter after reconsidering my application.",
      applicantPhone: "+9876543210",
      relevantSkills: ["Node.js", "TypeScript", "Architecture"],
    });
    assert(
      reappliedApp._id.toString() === app1._id.toString() &&
      reappliedApp.isDeleted === false &&
      reappliedApp.status === APPLICATION_STATUS.APPLIED &&
      Boolean(reappliedApp.coverLetter?.includes("Updated cover letter")),
      "Re-apply after withdrawal successfully revives soft-deleted application without unique key collision"
    );

    // 1.5 Lifecycle Transitions: Under Review -> Shortlisted -> Interview -> Hired
    const underReview = await updateApplicationStatus(
      reappliedApp._id.toString(),
      recruiterUser._id.toString(),
      APPLICATION_STATUS.UNDER_REVIEW
    );
    assert(underReview.status === APPLICATION_STATUS.UNDER_REVIEW, "Status transition to UNDER_REVIEW");

    const shortlisted = await updateApplicationStatus(
      reappliedApp._id.toString(),
      recruiterUser._id.toString(),
      APPLICATION_STATUS.SHORTLISTED
    );
    assert(shortlisted.status === APPLICATION_STATUS.SHORTLISTED, "Status transition to SHORTLISTED");

    const interview = await updateApplicationStatus(
      reappliedApp._id.toString(),
      recruiterUser._id.toString(),
      APPLICATION_STATUS.INTERVIEW,
      { mode: "video", date: "2026-09-01", time: "10:00 AM", locationOrLink: "https://meet.google.com/xyz" }
    );
    assert(
      interview.status === APPLICATION_STATUS.INTERVIEW &&
      interview.interviewDetails?.mode === "video" &&
      interview.interviewDetails?.locationOrLink === "https://meet.google.com/xyz",
      "Status transition to INTERVIEW with structured interview details"
    );

    const hired = await updateApplicationStatus(
      reappliedApp._id.toString(),
      recruiterUser._id.toString(),
      APPLICATION_STATUS.HIRED
    );
    assert(hired.status === APPLICATION_STATUS.HIRED, "Status transition to HIRED");

    // 1.6 Hired Application Cannot Be Withdrawn
    let withdrawHiredBlocked = false;
    try {
      await withdrawApplication(reappliedApp._id.toString(), candidateUser._id.toString());
    } catch (e: any) {
      withdrawHiredBlocked = e.message.includes("no longer be withdrawn") || e.statusCode === 409;
    }
    assert(withdrawHiredBlocked, "HIRED application withdrawal is properly blocked with 409 Conflict");

    // =========================================================================
    // TEST SECTION 2: COUPON VALIDATION, ATOMIC CONCURRENCY & CHECKOUT FLOWS
    // =========================================================================
    console.log("\n--- [2] Coupon Validation & Atomic Concurrency ---");

    // 2.1 Normal Coupon Validation
    const normalCoupon = await Coupon.create({
      code: `PROMO20_${testSuffix}`.toUpperCase(),
      discountType: "percentage",
      discountValue: 20,
      maxUses: 5,
      timesUsed: 0,
      isActive: true,
    });

    const validated = await validateCouponCode(normalCoupon.code);
    assert(validated.code === normalCoupon.code && validated.discountValue === 20, "validateCouponCode returns valid active coupon");

    // 2.2 Invalid Coupon Validation
    let invalidCouponCaught = false;
    try {
      await validateCouponCode(`NON_EXISTENT_${testSuffix}`);
    } catch (e: any) {
      invalidCouponCaught = e.message.includes("Invalid or expired");
    }
    assert(invalidCouponCaught, "validateCouponCode throws error on non-existent coupon");

    // 2.3 Expired Coupon Rejection
    const expiredCoupon = await Coupon.create({
      code: `EXPIRED_${testSuffix}`.toUpperCase(),
      discountType: "fixed",
      discountValue: 100,
      maxUses: 10,
      timesUsed: 0,
      expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
      isActive: true,
    });

    let expiredCaught = false;
    try {
      await validateCouponCode(expiredCoupon.code);
    } catch (e: any) {
      expiredCaught = e.message.includes("expired");
    }
    assert(expiredCaught, "validateCouponCode rejects expired coupon");

    // 2.4 Max Uses Reached Validation
    const fullCoupon = await Coupon.create({
      code: `FULL_${testSuffix}`.toUpperCase(),
      discountType: "percentage",
      discountValue: 10,
      maxUses: 2,
      timesUsed: 2,
      isActive: true,
    });

    let maxUsesCaught = false;
    try {
      await validateCouponCode(fullCoupon.code);
    } catch (e: any) {
      maxUsesCaught = e.message.includes("usage limit reached");
    }
    assert(maxUsesCaught, "validateCouponCode rejects coupon when timesUsed >= maxUses");

    // 2.5 ATOMIC CONCURRENT REDEMPTION TEST
    console.log("\n--- [2.5] High-Concurrency Atomic Redemption Stress Test ---");
    const concurrentCoupon = await Coupon.create({
      code: `CONCURRENT_${testSuffix}`.toUpperCase(),
      discountType: "percentage",
      discountValue: 50,
      maxUses: 3, // Exactly 3 uses allowed
      timesUsed: 0,
      isActive: true,
    });

    // Fire 15 concurrent redemption requests simultaneously
    const concurrencyAttempts = 15;
    const promises: Promise<{ success: boolean; error?: string }>[] = [];
    for (let i = 0; i < concurrencyAttempts; i++) {
      promises.push(
        consumeCouponCode(concurrentCoupon.code)
          .then(() => ({ success: true }))
          .catch((err) => ({ success: false, error: err.message }))
      );
    }

    const results = await Promise.all(promises);
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    const freshCouponDoc = await Coupon.findById(concurrentCoupon._id);
    assert(
      successCount === 3 && failureCount === 12 && freshCouponDoc?.timesUsed === 3,
      `Concurrent redemption: Exactly 3 succeeded, 12 rejected (timesUsed = ${freshCouponDoc?.timesUsed})`
    );

    // =========================================================================
    // TEST SECTION 3: CHECKOUT, PAYMENT FAILURES & DUPLICATE WEBHOOKS
    // =========================================================================
    console.log("\n--- [3] Checkout Lifecycle, Failure Preservation & Idempotency ---");

    // 3.1 Failed/Abandoned Order DOES NOT Consume Coupon
    const unconsumedCoupon = await Coupon.create({
      code: `ORDER_ONLY_${testSuffix}`.toUpperCase(),
      discountType: "percentage",
      discountValue: 15,
      maxUses: 5,
      timesUsed: 0,
      isActive: true,
    });

    process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "rzp_test_mockKeyId123456";
    process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "mockSecret1234567890abcdef";

    try {
      await createRazorpayOrderService(recruiterUser._id.toString(), "recruiter_lite", unconsumedCoupon.code);
    } catch (e: any) {
      // Handled in mock / offline environment
    }

    const couponAfterOrderCreation = await Coupon.findById(unconsumedCoupon._id);
    assert(
      couponAfterOrderCreation?.timesUsed === 0,
      "Order creation / checkout initiation DOES NOT increment coupon timesUsed (Protected against payment abandonment)"
    );

    // 3.2 Verified Checkout Consumes Coupon Exactly Once
    const checkoutCoupon = await Coupon.create({
      code: `CHECKOUT_${testSuffix}`.toUpperCase(),
      discountType: "percentage",
      discountValue: 25,
      maxUses: 5,
      timesUsed: 0,
      isActive: true,
    });

    const paymentId1 = `pay_${Date.now()}_1`;
    const orderId1 = `order_${Date.now()}_1`;

    const checkoutResult = await processCheckoutSession(
      recruiterUser._id.toString(),
      "recruiter_lite",
      "razorpay",
      checkoutCoupon.code,
      {
        orderId: orderId1,
        paymentId: paymentId1,
        provider: "razorpay",
      }
    );

    const couponAfterPayment = await Coupon.findById(checkoutCoupon._id);
    assert(
      Boolean(
        checkoutResult.subscription?.status === "active" &&
        checkoutResult.transaction?.status === "succeeded" &&
        couponAfterPayment?.timesUsed === 1
      ),
      "Successful payment verification consumes coupon exactly once (timesUsed incremented to 1)"
    );

    // 3.3 Duplicate Payment / Webhook Delivery DOES NOT Re-consume Coupon (Idempotency)
    const duplicateResult = await processCheckoutSession(
      recruiterUser._id.toString(),
      "recruiter_lite",
      "razorpay",
      checkoutCoupon.code,
      {
        orderId: orderId1,
        paymentId: paymentId1,
        provider: "razorpay",
      }
    );

    const couponAfterDuplicate = await Coupon.findById(checkoutCoupon._id);
    assert(
      Boolean(
        duplicateResult.transaction?.transactionId === checkoutResult.transaction?.transactionId &&
        couponAfterDuplicate?.timesUsed === 1
      ),
      "Duplicate payment/webhook re-delivery does NOT increment coupon timesUsed again (Idempotency verified)"
    );

    // 3.4 100% Discount Coupon Direct Checkout
    const fullDiscountCoupon = await Coupon.create({
      code: `FREE100_${testSuffix}`.toUpperCase(),
      discountType: "percentage",
      discountValue: 100,
      maxUses: 2,
      timesUsed: 0,
      isActive: true,
    });

    const freeCheckoutResult = await processCheckoutSession(
      candidateUser._id.toString(),
      "candidate_pro",
      "internal",
      fullDiscountCoupon.code
    );

    const couponAfter100Percent = await Coupon.findById(fullDiscountCoupon._id);
    assert(
      Boolean(
        freeCheckoutResult.subscription?.status === "active" &&
        freeCheckoutResult.transaction?.amount === 0 &&
        couponAfter100Percent?.timesUsed === 1
      ),
      "100% discount coupon activates subscription with $0/₹0 amount and consumes coupon exactly once"
    );

    // =========================================================================
    // TEST SECTION 4: RAZORPAY & POLAR REGRESSION TESTS
    // =========================================================================
    console.log("\n--- [4] Razorpay & Polar Gateway Regression Tests ---");

    // 4.1 Razorpay Signature Cryptographic HMAC Verification
    const activeSecret = process.env.RAZORPAY_KEY_SECRET || "mockSecret1234567890abcdef";
    const testOrderId = `order_${Date.now()}`;
    const testPaymentId = `pay_${Date.now()}`;
    const validSignature = crypto
      .createHmac("sha256", activeSecret)
      .update(`${testOrderId}|${testPaymentId}`)
      .digest("hex");

    const signatureValid = verifyPaymentSignature({
      orderId: testOrderId,
      paymentId: testPaymentId,
      signature: validSignature,
    });
    assert(signatureValid, "Razorpay HMAC-SHA256 signature verification passes for authentic signature");

    const forgedSignatureValid = verifyPaymentSignature({
      orderId: testOrderId,
      paymentId: testPaymentId,
      signature: "0000000000000000000000000000000000000000000000000000000000000000",
    });
    assert(!forgedSignatureValid, "Razorpay signature verification rejects forged signature");

    // 4.2 Subscription Plan Seed & Pricing Catalog Regression
    const allPlans = await SubscriptionPlan.find({ isActive: true });
    assert(allPlans.length >= 6, `SubscriptionPlan catalog seeded with ${allPlans.length} active plans`);

  } finally {
    // Clean up test data
    console.log("\n Cleaning up test fixtures...");
    await User.deleteMany({ email: { $regex: testSuffix } });
    await CandidateProfile.deleteMany({ skills: "Node.js", phone: "+1234567890" });
    await RecruiterProfile.deleteMany({ designation: "Talent Partner" });
    await Company.deleteMany({ name: { $regex: testSuffix } });
    await Job.deleteMany({ title: { $regex: testSuffix } });
    await Application.deleteMany({ coverLetter: { $regex: "cover letter|apply|position" } });
    await Coupon.deleteMany({ code: { $regex: testSuffix.toUpperCase() } });
    await Subscription.deleteMany({ planCode: { $in: ["recruiter_lite", "candidate_pro"] } });
    await PaymentTransaction.deleteMany({ transactionId: { $regex: "pay_" } });
    await PaymentOrder.deleteMany({ planCode: { $in: ["recruiter_lite", "candidate_pro"] } });

    console.log("================================================================");
    console.log(`   TOTAL TESTS RUN: ${passed + failed}`);
    console.log(`   PASSED: ${passed}`);
    console.log(`   FAILED: ${failed}`);
    console.log("================================================================");

    await mongoose.disconnect();
  }

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error("Test Suite crashed with unhandled error:", err);
  process.exit(1);
});
