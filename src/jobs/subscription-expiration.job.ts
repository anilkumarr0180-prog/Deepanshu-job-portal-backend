import cron from "node-cron";
import Subscription from "../models/subscription.model";
import { createNotification } from "../services/notification.service";
import { NOTIFICATION_TYPES } from "../constants/notification-type";
import { sendSubscriptionExpiringSoonEmail, sendSubscriptionExpiredEmail } from "../services/email.service";

/*
|--------------------------------------------------------------------------
| Subscription Auto-Expiration & Renewal Notice Cron Job
|--------------------------------------------------------------------------
| Runs daily to:
| 1. Expire subscriptions whose currentPeriodEnd has passed with auto-pay disabled.
| 2. Send 3-day advance warning emails & in-app notifications for upcoming expirations.
*/

export const initSubscriptionExpirationJob = () => {
  cron.schedule("0 0 * * *", async () => {
    try {
      const now = new Date();

      // 1. Process Expired Subscriptions (Canceled recurring subs or ended one-time purchases)
      const expiredSubs = await Subscription.find({
        status: "active",
        currentPeriodEnd: { $lte: now },
        $or: [{ cancelAtPeriodEnd: true }, { billingType: "one_time" }],
      }).populate("userId planId");

      for (const sub of expiredSubs) {
        sub.status = "expired";
        await sub.save();

        const user = sub.userId as any;
        const plan = sub.planId as any;

        if (user?._id && user?.email) {
          // In-App Realtime Notification
          createNotification({
            recipientId: user._id,
            type: NOTIFICATION_TYPES.SYSTEM_ALERT,
            title: "Subscription Expired",
            body: `Your ${plan?.name || "Premium"} subscription period has ended. You have been switched to the free tier.`,
            link: user.role === "recruiter" ? "/recruiter/pricing" : "/candidate/pricing",
          }).catch(() => {});

          // Email Notification
          sendSubscriptionExpiredEmail({
            userName: user.name || "Customer",
            userEmail: user.email,
            planName: plan?.name || "Premium Plan",
            role: user.role || "recruiter",
          }).catch((err) => console.error("Expiration email failed:", err));
        }
      }

      if (expiredSubs.length > 0) {
        console.log(`[Subscription Expiration Job] Processed ${expiredSubs.length} expired subscriptions.`);
      }

      // 2. Process 3-Day Upcoming Expiration Warnings
      const threeDaysFromNow = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
      const fourDaysFromNow = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);

      const expiringSoonSubs = await Subscription.find({
        status: "active",
        $or: [{ cancelAtPeriodEnd: true }, { billingType: "one_time" }],
        currentPeriodEnd: { $gte: threeDaysFromNow, $lt: fourDaysFromNow },
      }).populate("userId planId");

      for (const sub of expiringSoonSubs) {
        const user = sub.userId as any;
        const plan = sub.planId as any;

        if (user?._id && user?.email) {
          const expiryFormatted = new Date(sub.currentPeriodEnd).toLocaleDateString("en-IN", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });

          // In-App Warning Notification
          createNotification({
            recipientId: user._id,
            type: NOTIFICATION_TYPES.SYSTEM_ALERT,
            title: "Subscription Expiring in 3 Days ⏳",
            body: `Your ${plan?.name || "Premium"} plan will expire on ${expiryFormatted}. Re-enable auto-pay or renew to keep your features active.`,
            link: user.role === "recruiter" ? "/recruiter/billing" : "/candidate/billing",
          }).catch(() => {});

          // Email Warning
          sendSubscriptionExpiringSoonEmail({
            userName: user.name || "Customer",
            userEmail: user.email,
            planName: plan?.name || "Premium Plan",
            expiryDate: expiryFormatted,
            role: user.role || "recruiter",
          }).catch((err) => console.error("Expiring soon email failed:", err));
        }
      }
      // 3. Process Overdue Autopay Subscriptions (3-Day Grace Period Elapsed for recurring subscriptions)
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const overdueAutopaySubs = await Subscription.find({
        status: "active",
        billingType: "recurring",
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { $lte: threeDaysAgo },
      }).populate("userId planId");

      for (const sub of overdueAutopaySubs) {
        sub.status = "past_due";
        await sub.save();

        const user = sub.userId as any;
        const plan = sub.planId as any;

        if (user?._id) {
          createNotification({
            recipientId: user._id,
            type: NOTIFICATION_TYPES.SYSTEM_ALERT,
            title: "Payment Past Due ⚠️",
            body: `We were unable to auto-renew your ${plan?.name || "Premium"} plan. Please update your payment method to restore features.`,
            link: user.role === "recruiter" ? "/recruiter/billing" : "/candidate/billing",
          }).catch(() => {});
        }
      }

      if (overdueAutopaySubs.length > 0) {
        console.log(`[Subscription Expiration Job] Marked ${overdueAutopaySubs.length} overdue subscriptions as past_due.`);
      }
    } catch (error) {
      console.error("[Subscription Expiration Job] Error:", error);
    }
  });

  console.log("🕒 Cron Job Started: Subscription Auto-Expiration & 3-Day Notice Worker (Running Daily at 00:00)");
};
