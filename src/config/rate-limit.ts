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
  max: 10,
  standardHeaders: true,  // Return rate-limit info in RateLimit-* headers
  legacyHeaders: false,   // Disable X-RateLimit-* legacy headers
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes.",
  },
  skip: () => process.env.NODE_ENV === "test", // Don't rate-limit during tests
});

/**
 * General API limiter for all other routes.
 * Prevents scraping and general abuse.
 * 200 requests per 15 minutes per IP.
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes.",
  },
  skip: () => process.env.NODE_ENV === "test",
});
