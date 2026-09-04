import rateLimit from "express-rate-limit";

/*
|--------------------------------------------------------------------------
| Rate Limiters
|--------------------------------------------------------------------------
| Defined in one place so all route files can import the right limiter.
| Adjust windowMs / max values per environment as needed.
*/

/**
 * Strict limiter for auth endpoints (login, register, google oauth).
 * Prevents brute-force and credential-stuffing attacks.
 * 10 requests per 15 minutes per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 15 : 1000,
  standardHeaders: true, // Return rate-limit info in RateLimit-* headers
  legacyHeaders: false, // Disable X-RateLimit-* legacy headers
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many authentication attempts from this IP, please try again after 15 minutes.",
      errors: [],
    });
  },
  skip: () => process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development",
});

/**
 * General API limiter for all other routes.
 * Prevents scraping and general abuse.
 * 200 requests per 15 minutes per IP in production.
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 300 : 5000,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many requests from this IP, please try again after 15 minutes.",
      errors: [],
    });
  },
  skip: () => process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development",
});

/**
 * Dedicated rate limiter for contact form inquiries.
 * Prevents automated email flooding, spam, and resource abuse.
 * 10 requests per 15 minutes per IP.
 */
export const contactRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "production" ? 10 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      message: "Too many messages sent from this IP. Please try again after 15 minutes.",
      errors: [],
    });
  },
  skip: () => process.env.NODE_ENV === "test" || process.env.NODE_ENV === "development",
});

