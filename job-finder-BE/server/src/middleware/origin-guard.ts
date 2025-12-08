import type { NextFunction, Request, Response } from 'express'
import { ApiHttpError } from './api-error'
import { ApiErrorCode } from '@shared/types'

/**
 * Blocks cross-site mutation requests when Origin header is present and not allowed.
 * GET/HEAD/OPTIONS are always allowed to keep health and public reads working.
 */
export function buildOriginGuard(allowedOrigins: string[]) {
  const allowed = new Set(allowedOrigins)
  const isProd = process.env.NODE_ENV === 'production'

  return function originGuard(req: Request, _res: Response, next: NextFunction) {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
      return next()
    }

    // Skip strict origin checks outside production to unblock local/tests/tools
    if (!isProd) return next()

    const origin = req.headers.origin
    if (!origin) {
      // Treat absent Origin as non-browser client; allow
      return next()
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
