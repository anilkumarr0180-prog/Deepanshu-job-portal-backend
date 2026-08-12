import { NextFunction, Response } from "express";
import { AuthRequest } from "../middleware/auth.middleware";
import { verifyUserQuota } from "../services/subscription.service";
import { asyncHandler } from "../middleware/async-handler";

/**
 * Middleware to enforce recruiter job posting and feature quotas based on subscription tier.
 *
 * Uses asyncHandler so any thrown errors (including from verifyUserQuota) are
 * automatically forwarded to the global errorMiddleware — the previous IIFE
 * pattern bypassed this and could silently swallow errors.
 */
export const checkSubscriptionJobLimit = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
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
  }
);
