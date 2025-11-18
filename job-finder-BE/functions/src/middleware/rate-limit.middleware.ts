import rateLimit from "express-rate-limit"
import type { Request } from "express"
import { logger } from "../utils/logger"

/**
 * Rate limiting middleware for contact form
 *
 * Prevents abuse by limiting the number of requests from a single IP address.
 *
 * Limits:
 * - 5 requests per 15 minutes per IP (production)
 * - 10 requests per 15 minutes per IP (staging/development)
 *
 * This is intentionally conservative to prevent spam while allowing legitimate users
 * who might need to resubmit if they make a typo.
 */

const isProduction = process.env.NODE_ENV === "production"
const isTestEnvironment = process.env.NODE_ENV === "test" || process.env.JEST_WORKER_ID !== undefined

/**
 * Extract IP address from request, handling Firebase Cloud Functions format
 * Firebase Cloud Functions uses X-Forwarded-For header
 */
function getClientIp(req: Request): string {
  // For Firebase Cloud Functions, check X-Forwarded-For first
  const forwardedFor = req.headers["x-forwarded-for"]
  if (forwardedFor) {
    // X-Forwarded-For can be a comma-separated list, take the first one (client IP)
    const ips = typeof forwardedFor === "string" ? forwardedFor.split(",") : forwardedFor
    return ips[0].trim()
  }

  // Fallback to req.ip (standard Express)
  if (req.ip) {
    return req.ip
  }

  // Last resort: use a placeholder for local/test environments
  return "unknown"
}

/**
 * Rate limiter configuration
 */
export const contactFormRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 5 : 10, // Limit each IP to 5 (prod) or 10 (dev) requests per windowMs
  message: {
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    errorCode: "CF_SEC_003",
    message: "Too many requests. Please try again later.",
  },
  standardHeaders: "draft-7", // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: () => isTestEnvironment, // Skip rate limiting in tests
  keyGenerator: (req) => getClientIp(req), // Custom IP extraction for Firebase Cloud Functions
  handler: (req, res) => {
    logger.warning("[RateLimit] Rate limit exceeded", {
      ip: getClientIp(req),
      path: req.path,
    })

    res.status(429).json({
      success: false,
      error: "RATE_LIMIT_EXCEEDED",
      errorCode: "CF_SEC_003",
      message: "Too many requests from this IP. Please try again in 15 minutes.",
    })
  },
})

/**
 * More restrictive rate limiter for detected suspicious activity
 * Can be applied conditionally based on honeypot triggers or other signals
 */
export const strictRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1, // Only 1 request per hour
  message: {
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    errorCode: "CF_SEC_004",
    message: "Access temporarily restricted. Please contact support if you believe this is an error.",
  },
  skip: () => isTestEnvironment,
  keyGenerator: (req) => getClientIp(req),
  handler: (req, res) => {
    logger.warning("[RateLimit] Strict rate limit applied", {
      ip: getClientIp(req),
      path: req.path,
      reason: "suspicious_activity",
    })

    res.status(429).json({
      success: false,
      error: "ACCESS_RESTRICTED",
      errorCode: "CF_SEC_004",
      message: "Access temporarily restricted due to suspicious activity.",
    })
  },
})

/**
 * Rate limiter for experience API endpoints
 * Moderate limits for authenticated CRUD operations
 */
export const experienceRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 30 : 100, // 30 requests per 15 min (prod) or 100 (dev)
  message: {
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    errorCode: "EXP_SEC_001",
    message: "Too many requests. Please try again later.",
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => isTestEnvironment,
  keyGenerator: (req) => getClientIp(req),
})

/**
 * Rate limiter for generator API endpoints (public)
 * More restrictive due to resource-intensive AI operations
 */
export const generatorRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 5 : 20, // 5 generations per 15 min (prod) or 20 (dev)
  message: {
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    errorCode: "GEN_SEC_001",
    message: "Too many generation requests. Please try again later.",
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => isTestEnvironment,
  keyGenerator: (req) => getClientIp(req),
})

/**
 * Rate limiter for authenticated generator editor operations
 * More permissive for logged-in users
 */
export const generatorEditorRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isProduction ? 20 : 50, // 20 requests per 15 min (prod) or 50 (dev)
  message: {
    success: false,
    error: "RATE_LIMIT_EXCEEDED",
    errorCode: "GEN_SEC_002",
    message: "Too many requests. Please try again later.",
  },
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => isTestEnvironment,
  keyGenerator: (req) => getClientIp(req),
})
