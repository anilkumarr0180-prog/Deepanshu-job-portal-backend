import { Response, NextFunction } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { verifyUserQuota } from "../services/subscription.service";

/**
 * Middleware to enforce recruiter job posting and feature quotas based on subscription tier.
 */
export function checkSubscriptionJobLimit(req: AuthRequest, res: Response, next: NextFunction): void {
  (async () => {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: "Unauthorized user" });
        return;
      }

      // Check if user is trying to feature a job
      const isFeaturedRequested = req.body.isFeatured === true;
      if (isFeaturedRequested) {
        const featuredQuota = await verifyUserQuota(userId, "featured_job");
        if (!featuredQuota.allowed) {
          res.status(403).json({
            success: false,
            message: featuredQuota.message,
            quotaError: "FEATURED_JOB_LIMIT_REACHED",
            upgradeRequired: true,
          });
          return;
        }
      }

      // Check standard active job posting limit
      const jobQuota = await verifyUserQuota(userId, "post_job");
      if (!jobQuota.allowed) {
        res.status(403).json({
          success: false,
          message: jobQuota.message,
          quotaError: "JOB_LIMIT_REACHED",
          upgradeRequired: true,
        });
        return;
      }

      next();
    } catch (error: any) {
      console.error("Quota check failed:", error);
      res.status(500).json({ success: false, message: "Subscription quota verification error" });
    }
  })();
}
