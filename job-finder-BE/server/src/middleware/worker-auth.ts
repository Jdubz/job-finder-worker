import * as crypto from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env'
import { ApiErrorCode } from '@shared/types'
import { ApiHttpError } from './api-error'

/**
 * Middleware to authenticate worker requests using the shared worker token.
 * Used for worker-to-API communication endpoints (events, commands).
 */
export function verifyWorkerToken(req: Request, _res: Response, next: NextFunction) {
  // If no worker token is configured, allow all requests (dev mode)
  if (!env.WORKER_WS_TOKEN) {
    return next()
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return next(new ApiHttpError(ApiErrorCode.UNAUTHORIZED, 'Missing Authorization header', { status: 401 }))
  }

  const token = authHeader.slice('Bearer '.length)
  if (
    token.length !== env.WORKER_WS_TOKEN.length ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(env.WORKER_WS_TOKEN))
  ) {
    return next(new ApiHttpError(ApiErrorCode.INVALID_TOKEN, 'Invalid worker token', { status: 401 }))
  }

  return next()
}
