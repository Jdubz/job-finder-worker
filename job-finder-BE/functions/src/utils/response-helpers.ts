/**
 * Response Helper Utilities
 *
 * Centralized response handling to eliminate 81+ duplicate response patterns.
 * Provides consistent error handling, success responses, and HTTP status codes.
 */

import type { Response } from 'express';
import { SimpleLogger } from '../types/logger.types';

/**
 * Standard API response format
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  timestamp?: string;
  requestId?: string;
}

/**
 * Error response options
 */
export interface ErrorResponseOptions {
  logger?: SimpleLogger;
  logContext?: Record<string, unknown>;
  requestId?: string;
}

/**
 * Success response options
 */
export interface SuccessResponseOptions {
  logger?: SimpleLogger;
  logContext?: Record<string, unknown>;
  requestId?: string;
  statusCode?: number;
}

/**
 * Send standardized error response
 *
 * @example
 * sendErrorResponse(res, 400, "Invalid input", "VALIDATION_ERROR", { logger, requestId })
 */
export function sendErrorResponse(
  res: Response,
  statusCode: number,
  message: string,
  code?: string,
  options?: ErrorResponseOptions
): void {
  const { logger, logContext, requestId } = options || {};

  // Log error if logger provided
  if (logger) {
    logger.error(message, {
      statusCode,
      code,
      requestId,
      ...logContext
    });
  }

  // Send response
  res.status(statusCode).json({
    success: false,
    error: message,
    code: code || `HTTP_${statusCode}`,
    timestamp: new Date().toISOString(),
    requestId,
  } as ApiResponse);
}

/**
 * Send standardized success response
 *
 * @example
 * sendSuccessResponse(res, { items: [...] }, { logger, requestId })
 */
export function sendSuccessResponse<T>(
  res: Response,
  data: T,
  options?: SuccessResponseOptions
): void {
  const { logger, logContext, requestId, statusCode = 200 } = options || {};

  // Log success if logger provided
  if (logger) {
    logger.info('Request successful', {
      statusCode,
      requestId,
      ...logContext,
    });
  }

  // Send response
  res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
    requestId,
  } as ApiResponse<T>);
}

/**
 * Send standardized validation error (400)
 */
export function sendValidationError(
  res: Response,
  message: string,
  options?: ErrorResponseOptions
): void {
  sendErrorResponse(
    res,
    400,
    message,
    'VALIDATION_ERROR',
    options
  );
}

/**
 * Send standardized authentication error (401)
 */
export function sendAuthError(
  res: Response,
  message: string = 'Authentication required',
  options?: ErrorResponseOptions
): void {
  sendErrorResponse(
    res,
    401,
    message,
    'UNAUTHORIZED',
    options
  );
}

/**
 * Send standardized authorization error (403)
 */
export function sendForbiddenError(
  res: Response,
  message: string = 'Insufficient permissions',
  options?: ErrorResponseOptions
): void {
  sendErrorResponse(
    res,
    403,
    message,
    'FORBIDDEN',
    options
  );
}

/**
 * Send standardized not found error (404)
 */
export function sendNotFoundError(
  res: Response,
  resource: string,
  options?: ErrorResponseOptions
): void {
  sendErrorResponse(
    res,
    404,
    `${resource} not found`,
    'NOT_FOUND',
    options
  );
}

/**
 * Send standardized rate limit error (429)
 */
export function sendRateLimitError(
  res: Response,
  message: string = 'Rate limit exceeded',
  options?: ErrorResponseOptions
): void {
  sendErrorResponse(
    res,
    429,
    message,
    'RATE_LIMIT',
    options
  );
}

/**
 * Send standardized internal server error (500)
 */
export function sendInternalError(
  res: Response,
  message: string = 'Internal server error',
  error?: Error,
  options?: ErrorResponseOptions
): void {
  const { logger, logContext, requestId } = options || {};

  // Log full error details
  if (logger && error) {
    logger.error('Internal server error', {
      error: error.message,
      stack: error.stack,
      requestId,
      ...logContext,
    });
  }

  sendErrorResponse(
    res,
    500,
    message,
    'INTERNAL_ERROR',
    options
  );
}

/**
 * Handle async route errors with consistent error responses
 *
 * @example
 * app.get('/items', asyncHandler(async (req, res) => {
 *   const items = await getItems();
 *   sendSuccessResponse(res, { items });
 * }));
 */
export function asyncHandler(
  fn: (req: any, res: Response) => Promise<void>
) {
  return (req: any, res: Response) => {
    Promise.resolve(fn(req, res)).catch((error: Error) => {
      sendInternalError(res, 'An unexpected error occurred', error, {
        logContext: { path: req.path, method: req.method },
      });
    });
  };
}

/**
 * Validate required fields in request body
 *
 * @example
 * if (!validateRequiredFields(req.body, ['name', 'email'], res, logger)) return;
 */
export function validateRequiredFields(
  data: Record<string, unknown>,
  fields: string[],
  res: Response,
  logger?: SimpleLogger,
  requestId?: string
): boolean {
  const missingFields = fields.filter(field => !data[field]);

  if (missingFields.length > 0) {
    sendValidationError(
      res,
      `Missing required fields: ${missingFields.join(', ')}`,
      { logger, requestId, logContext: { missingFields } }
    );
    return false;
  }

  return true;
}

/**
 * Send paginated response with metadata
 */
export function sendPaginatedResponse<T>(
  res: Response,
  items: T[],
  total: number,
  page: number,
  limit: number,
  options?: SuccessResponseOptions
): void {
  const totalPages = Math.ceil(total / limit);
  const hasNext = page < totalPages;
  const hasPrev = page > 1;

  sendSuccessResponse(
    res,
    {
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNext,
        hasPrev,
      },
    },
    options
  );
}
