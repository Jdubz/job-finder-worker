import type { Request, Response, NextFunction } from 'express'
import { ApiErrorCode, getApiErrorDefinition } from '@shared/types'
import { logger } from '../logger'
import { failure } from '../utils/api-response'

export class ApiHttpError extends Error {
  code: ApiErrorCode | string
  status: number
  details?: Record<string, unknown>

  constructor(
    code: ApiErrorCode | string,
    message?: string,
    options?: {
      status?: number
      details?: Record<string, unknown>
      cause?: unknown
    }
  ) {
    const definition = getApiErrorDefinition(code)
    super(message ?? definition.defaultMessage)
    this.name = 'ApiHttpError'
    this.code = code
    this.status = options?.status ?? definition.httpStatus
    this.details = options?.details
    if (options?.cause) {
      // Preserve original error stack if provided
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(this as any).cause = options.cause
    }
  }
}

interface NormalizedError {
  code: ApiErrorCode | string
  message: string
  status: number
  details?: Record<string, unknown>
  stack?: string
}

const normalizeError = (err: unknown): NormalizedError => {
  if (err instanceof ApiHttpError) {
    return {
      code: err.code,
      message: err.message,
      status: err.status,
      details: err.details,
      stack: err.stack
    }
  }

  if (err && typeof err === 'object') {
    const maybeCode = (err as { code?: string }).code
    const maybeStatus = (err as { status?: number }).status
    const maybeMessage = (err as { message?: string }).message
    const details = (err as { details?: Record<string, unknown> }).details
    const definition = getApiErrorDefinition(maybeCode ?? ApiErrorCode.INTERNAL_ERROR)

    return {
      code: maybeCode ?? ApiErrorCode.INTERNAL_ERROR,
      message: maybeMessage ?? definition.defaultMessage,
      status: maybeStatus ?? definition.httpStatus,
      details,
      stack: (err as Error).stack
    }
  }

  const definition = getApiErrorDefinition(ApiErrorCode.INTERNAL_ERROR)
  return {
    code: ApiErrorCode.INTERNAL_ERROR,
    message: definition.defaultMessage,
    status: definition.httpStatus
  }
}

export const apiErrorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const normalized = normalizeError(err)
  const definition = getApiErrorDefinition(normalized.code)
  const status = normalized.status || definition.httpStatus

  const response = failure(normalized.code ?? ApiErrorCode.INTERNAL_ERROR, normalized.message ?? definition.defaultMessage, {
    ...(normalized.details ?? {}),
    path: req.path
  })

  if (process.env.NODE_ENV !== 'production' && err instanceof Error && err.stack) {
    response.error.stack = err.stack
  }

  const logLevel = status >= 500 ? 'error' : 'warn'
  logger[logLevel]({ err, code: normalized.code, status, path: req.path }, 'API error response')

  if (res.headersSent) return
  res.status(status).json(response)
}
