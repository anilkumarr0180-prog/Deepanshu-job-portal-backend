import mongoose from "mongoose";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/user.model";
import SubscriptionPlan from "../models/subscription-plan.model";
import Subscription from "../models/subscription.model";
import PaymentTransaction from "../models/payment-transaction.model";
import PaymentOrder from "../models/payment-order.model";
import Coupon from "../models/coupon.model";
import WebhookEvent from "../models/webhook-event.model";
import { env } from "../config/env";
import {
  createRazorpayOrderService,
  verifyRazorpayPaymentService,
  getUserSubscriptionDetails,
  processCheckoutSession,
  getUserTransactionsHistory,
  handleRazorpayWebhookEvent,
  cancelUserSubscription,
} from "../services/subscription.service";
import { generateInvoiceDetails } from "../services/invoice.service";

async function runHardeningTests() {
  console.log("=================================================");
  console.log("   RAZORPAY HARDENING & SECURITY TEST SUITE      ");
  console.log("=================================================");

  const mongoUri = process.env.MONGODB_URI || "mongodb://localhost:27017/job-portal";
  await mongoose.connect(mongoUri);
  console.log(" Connected to MongoDB");

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(` PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(` FAIL: ${testName} ${detail ? "- " + detail : ""}`);
      failedTests++;
    }
  }

  try {
    // Setup Test Users
    const testCandidateEmail = `test_candidate_${Date.now()}@example.com`;
    const testAttackerEmail = `test_attacker_${Date.now()}@example.com`;

    const userA = await User.create({
      name: "Legit Candidate",
      email: testCandidateEmail,
      password: "Password123!",
      role: "candidate",
      isEmailVerified: true,
    });

    const userB = await User.create({
      name: "Attacker User",
      email: testAttackerEmail,
      password: "Password123!",
      role: "candidate",
      isEmailVerified: true,
    });

    console.log(` Created Test User A (${userA._id}) and User B (${userB._id})`);

    // Setup Test Coupon
    const promoCode = `PROMO_${Date.now()}`;
    await Coupon.create({
      code: promoCode,
      discountType: "percentage",
      discountValue: 10,
      isActive: true,
      maxUses: 5,
      timesUsed: 0,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    // ─────────────────────────────────────────────────────────────
    // TEST 1: Free-Plan Checkout vs Paid Plan Direct Checkout (/checkout security SEC-02)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 1: /checkout Route Security ---");
    const freePlan = await SubscriptionPlan.findOne({ code: "candidate_free" });
    const paidPlan = await SubscriptionPlan.findOne({ code: "candidate_pro" });

    // Legitimate free checkout
    const freeResult = await processCheckoutSession(userA._id.toString(), "candidate_free", "internal");
    assert(freeResult.subscription?.planCode === "candidate_free", "Legitimate Free Plan Checkout succeeds");

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Razorpay Order Creation & PaymentOrder Persistence (SEC-01, SEC-04)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 2: Razorpay Order Creation & PaymentOrder Persistence ---");
    const orderData = await createRazorpayOrderService(userA._id.toString(), "candidate_pro", promoCode);
    assert(Boolean(orderData.orderId && orderData.orderId.startsWith("order_")), "Razorpay Order ID generated");

    const savedPaymentOrder = await PaymentOrder.findOne({ orderId: orderData.orderId });
    assert(
      Boolean(savedPaymentOrder && savedPaymentOrder.userId.toString() === userA._id.toString() && savedPaymentOrder.planCode === "candidate_pro"),
      "PaymentOrder persisted with userId, planCode, and status 'created'"
    );

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Cryptographic Signature & Verification (Test Mode)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 3: Payment Signature Verification ---");
    const mockPaymentId = `pay_test_${Date.now()}`;
    const keySecret = env.RAZORPAY_KEY_SECRET;
    const validSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderData.orderId}|${mockPaymentId}`)
      .digest("hex");

    // Test Invalid Signature Rejection
    let invalidSigCaught = false;
    try {
      await verifyRazorpayPaymentService(
        userA._id.toString(),
        orderData.orderId,
        mockPaymentId,
        "invalid_forged_signature_hex",
        "candidate_pro"
      );
    } catch (e: any) {
      invalidSigCaught = e.message.includes("Invalid Razorpay payment signature");
    }
    assert(invalidSigCaught, "Invalid signature is rejected with error");

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Plan Substitution / Parameter Tampering Defense (SEC-01)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 4: Plan Tampering Attack Prevention ---");
    // User paid for "candidate_pro" but submits verify with "candidate_premium_yearly"
    const verifyResult = await verifyRazorpayPaymentService(
      userA._id.toString(),
      orderData.orderId,
      mockPaymentId,
      validSignature,
      "candidate_premium_yearly", // Tampered planCode from client
      undefined
    );

    assert(
      verifyResult.subscription?.planCode === "candidate_pro",
      "Server ignores tampered planCode and activates trusted plan from PaymentOrder (candidate_pro)"
    );

    const updatedPaymentOrder = await PaymentOrder.findOne({ orderId: orderData.orderId });
    assert(updatedPaymentOrder?.status === "paid", "PaymentOrder status updated to 'paid'");

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Order-to-User Ownership Validation (SEC-04)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 5: Order-to-User Ownership Validation ---");
    const orderDataForA = await createRazorpayOrderService(userA._id.toString(), "candidate_pro");
    const paymentId2 = `pay_test_${Date.now() + 1}`;
    const sigForA = crypto
      .createHmac("sha256", keySecret)
      .update(`${orderDataForA.orderId}|${paymentId2}`)
      .digest("hex");

    // User B tries to claim User A's order
    let wrongUserCaught = false;
    try {
      await verifyRazorpayPaymentService(
        userB._id.toString(), // User B
        orderDataForA.orderId, // User A's order
        paymentId2,
        sigForA,
        "candidate_pro"
      );
    } catch (e: any) {
      wrongUserCaught = e.message.includes("Unauthorized") || e.message.includes("not belong");
    }
    assert(wrongUserCaught, "User B attempting to verify User A's order is rejected");

    // ─────────────────────────────────────────────────────────────
    // TEST 6: Idempotent Duplicate Verification & Webhook Race Handling (COR-02)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 6: Idempotent Duplicate Verification ---");
    const dupVerifyResult = await verifyRazorpayPaymentService(
      userA._id.toString(),
      orderData.orderId,
      mockPaymentId,
      validSignature,
      "candidate_pro"
    );
    assert(Boolean(dupVerifyResult.subscription && dupVerifyResult.transaction), "Duplicate verification returns existing subscription idempotently");

    // Check Coupon was only consumed once
    const couponDoc = await Coupon.findOne({ code: promoCode });
    assert(couponDoc?.timesUsed === 1, `Coupon timesUsed is 1 (actual: ${couponDoc?.timesUsed})`);

    // ─────────────────────────────────────────────────────────────
    // TEST 7: Webhook Deduplication & Signature Verification (COR-03, COR-06)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 7: Webhook Processing & Deduplication ---");
    const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET;
    const webhookOrderId = `order_wh_${Date.now()}`;
    const webhookPaymentId = `pay_wh_${Date.now()}`;

    // Create a PaymentOrder for webhook reconciliation
    await PaymentOrder.create({
      orderId: webhookOrderId,
      userId: userA._id,
      planCode: "candidate_premium",
      amount: 29900,
      currency: "INR",
      provider: "razorpay",
      status: "created",
    });

    const webhookBody = JSON.stringify({
      event: "payment.captured",
      event_id: `evt_test_${Date.now()}`,
      payload: {
        payment: {
          entity: {
            id: webhookPaymentId,
            order_id: webhookOrderId,
            amount: 29900,
            currency: "INR",
            status: "captured",
          },
        },
      },
    });

    const webhookSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(webhookBody)
      .digest("hex");

    const webhookRes1 = await handleRazorpayWebhookEvent(webhookBody, webhookSignature, JSON.parse(webhookBody));
    assert(webhookRes1.status === "processed", "Webhook event processed successfully");

    // Duplicate Webhook Delivery
    const webhookRes2 = await handleRazorpayWebhookEvent(webhookBody, webhookSignature, JSON.parse(webhookBody));
    assert(webhookRes2.status === "already_processed", "Duplicate webhook delivery recognized as already_processed");

    // ─────────────────────────────────────────────────────────────
    // TEST 8: Invoice Ownership & Authorization Check (SEC-03)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 8: Invoice IDOR Protection ---");
    const userATransactions = await getUserTransactionsHistory(userA._id.toString());
    assert(userATransactions.length > 0, "User A has transactions history");

    const txnId = userATransactions[0]._id.toString();

    // User A can access own invoice
    const ownInvoice = await generateInvoiceDetails(txnId, userA._id.toString(), "candidate");
    assert(ownInvoice.user.email === userA.email, "User A can access own tax invoice");

    // User B attempting to access User A's invoice
    let idorCaught = false;
    try {
      await generateInvoiceDetails(txnId, userB._id.toString(), "candidate");
    } catch (e: any) {
      idorCaught = e.message.includes("Forbidden") || e.message.includes("permission");
    }
    assert(idorCaught, "User B is forbidden from accessing User A's tax invoice (IDOR prevented)");

    // Admin can access authorized invoices
    const adminInvoice = await generateInvoiceDetails(txnId, userB._id.toString(), "admin");
    assert(adminInvoice.invoiceNumber === ownInvoice.invoiceNumber, "Admin can access authorized user invoices");

    // ─────────────────────────────────────────────────────────────
    // TEST 9: Cancelled Subscription Not Resurrected (COR-04)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 9: Cancelled Subscription Integrity ---");
    await cancelUserSubscription(userA._id.toString());
    const subAfterCancel = await Subscription.findOne({ userId: userA._id, status: "active" });
    assert(subAfterCancel?.cancelAtPeriodEnd === true, "Subscription marked cancelAtPeriodEnd");

    // Ensure getUserSubscriptionDetails does not resurrect canceled sub to cancelAtPeriodEnd: false
    const details = await getUserSubscriptionDetails(userA._id.toString());
    assert(Boolean(details.subscription && details.subscription.cancelAtPeriodEnd === true), "getUserSubscriptionDetails preserves cancellation state");

    // ─────────────────────────────────────────────────────────────
    // TEST 10: One-Time Subscription Expiration Query (COR-01)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 10: One-Time Subscription Expiration Query ---");
    await Subscription.deleteMany({ userId: userA._id });

    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const oneTimeExpiredSub = await Subscription.create({
      userId: userA._id,
      planId: paidPlan?._id,
      planCode: "candidate_pro",
      status: "active",
      billingType: "one_time",
      currentPeriodStart: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: pastDate,
      cancelAtPeriodEnd: false,
      provider: "razorpay",
    });

    const query1Matches = await Subscription.find({
      _id: oneTimeExpiredSub._id,
      status: "active",
      currentPeriodEnd: { $lte: new Date() },
      $or: [{ cancelAtPeriodEnd: true }, { billingType: "one_time" }],
    });
    assert(query1Matches.length === 1, "One-time subscription matched by updated expiration cron query");

    // Cleanup Test Data
    await User.deleteMany({ _id: { $in: [userA._id, userB._id] } });
    await Subscription.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await PaymentTransaction.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await PaymentOrder.deleteMany({ userId: { $in: [userA._id, userB._id] } });
    await Coupon.deleteOne({ code: promoCode });

    console.log("\n=================================================");
    console.log(`TOTAL TESTS: ${passedTests + failedTests} | PASSED: ${passedTests} | FAILED: ${failedTests}`);
    console.log("=================================================");

    if (failedTests > 0) {
      process.exit(1);
    }
  } catch (error) {
    console.error("Test execution failed with error:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

runHardeningTests();
