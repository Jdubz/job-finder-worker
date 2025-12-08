import type { NextFunction, Request, Response } from 'express'

type RateLimitOptions = {
  windowMs: number
  max: number
  keyGenerator?: (req: Request) => string | null | undefined
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
  const keyFor = options.keyGenerator ?? ((req: Request) => req.ip ?? null)

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const key = keyFor(req)
    if (!key) return next() // avoid shared/global bucket; skip when no key

    const now = Date.now()
    const bucket = buckets.get(key)

    if (bucket && bucket.expiresAt > now) {
      if (bucket.count >= options.max) {
        res.status(429).json({ error: 'Too many requests, please slow down' })
        return
      }
      bucket.count += 1
    } else {
      // Cleanup expired bucket before replacing to avoid leak
      if (bucket && bucket.expiresAt <= now) {
        buckets.delete(key)
      }
      buckets.set(key, { count: 1, expiresAt: now + options.windowMs })
    }

    // Opportunistic cleanup of a few expired buckets to avoid unbounded growth
    let pruned = 0
    for (const [k, b] of buckets) {
      if (b.expiresAt <= now) {
        buckets.delete(k)
        pruned++
        if (pruned >= 5) break // limit per-request work
      }
    }

    next()
  }
}
