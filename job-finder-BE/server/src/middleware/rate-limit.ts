import type { NextFunction, Request, Response } from 'express'

type RateLimitOptions = {
  windowMs: number
  max: number
  keyGenerator?: (req: Request) => string
}

type Bucket = {
  expiresAt: number
  count: number
}

/**
 * Lightweight in-memory rate limiter for low-volume endpoints.
 * Not intended for multi-instance deployments; use an external store for production scale.
 */
export function rateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, Bucket>()
  const keyFor = options.keyGenerator ?? ((req: Request) => req.ip || 'global')

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const key = keyFor(req)
    const now = Date.now()
    const bucket = buckets.get(key)

    if (bucket && bucket.expiresAt > now) {
      if (bucket.count >= options.max) {
        res.status(429).json({ error: 'Too many requests, please slow down' })
        return
      }
      bucket.count += 1
      buckets.set(key, bucket)
    } else {
      buckets.set(key, { count: 1, expiresAt: now + options.windowMs })
    }

    next()
  }
}
