import type { NextFunction, Request, Response } from 'express'
import { ApiHttpError } from './api-error'
import { ApiErrorCode } from '@shared/types'

/**
 * Blocks cross-site mutation requests when Origin header is present and not allowed.
 * GET/HEAD/OPTIONS are always allowed to keep health and public reads working.
 */
export function buildOriginGuard(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins)

  return function originGuard(req: Request, _res: Response, next: NextFunction) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next()
    }

    const origin = req.headers.origin
    if (!origin) {
      // Fallback to Referer when Origin is missing
      const referer = req.headers.referer
      if (referer) {
        try {
          const refererOrigin = new URL(referer).origin
          if (allowed.has(refererOrigin)) {
            return next()
          }
        } catch {
          // invalid referer; fall through
        }
      }
      return next(new ApiHttpError(ApiErrorCode.FORBIDDEN, 'Cross-site request blocked (missing Origin/Referer)', {
        status: 403,
        details: { origin: null, referer: referer ?? null }
      }))
    }

    if (allowed.has(origin)) {
      return next()
    }

    next(new ApiHttpError(ApiErrorCode.FORBIDDEN, 'Cross-site request blocked', {
      status: 403,
      details: { origin }
    }))
  }
}
