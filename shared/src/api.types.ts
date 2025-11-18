/**
 * API Types
 *
 * Core API type definitions for FE-BE communication.
 * Provides consistent request/response patterns, error handling,
 * and Firebase callable function types.
 *
 * Used by both job-finder-BE (Firebase Functions) and job-finder-FE.
 */

/**
 * API Error Codes
 * Standardized error codes for consistent error handling across all API endpoints
 */
export enum ApiErrorCode {
  // Authentication errors
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  INVALID_TOKEN = "INVALID_TOKEN",

  // Validation errors
  INVALID_REQUEST = "INVALID_REQUEST",
  MISSING_FIELD = "MISSING_FIELD",
  INVALID_FIELD = "INVALID_FIELD",
  VALIDATION_FAILED = "VALIDATION_FAILED",

  // Resource errors
  NOT_FOUND = "NOT_FOUND",
  ALREADY_EXISTS = "ALREADY_EXISTS",
  RESOURCE_CONFLICT = "RESOURCE_CONFLICT",

  // Processing errors
  GENERATION_FAILED = "GENERATION_FAILED",
  AI_SERVICE_ERROR = "AI_SERVICE_ERROR",
  PDF_GENERATION_FAILED = "PDF_GENERATION_FAILED",
  STORAGE_ERROR = "STORAGE_ERROR",

  // Rate limiting
  RATE_LIMIT_EXCEEDED = "RATE_LIMIT_EXCEEDED",
  QUOTA_EXCEEDED = "QUOTA_EXCEEDED",

  // System errors
  INTERNAL_ERROR = "INTERNAL_ERROR",
  SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
  TIMEOUT = "TIMEOUT",
  DATABASE_ERROR = "DATABASE_ERROR",
}

/**
 * Generic API success response wrapper
 * Discriminated union type with success: true
 */
export interface ApiSuccessResponse<T> {
  success: true
  data: T
  message?: string
  metadata?: {
    timestamp?: string
    requestId?: string
    [key: string]: unknown
  }
}

/**
 * Generic API error response
 * Discriminated union type with success: false
 */
export interface ApiErrorResponse {
  success: false
  error: {
    code: ApiErrorCode | string
    message: string
    details?: Record<string, unknown>
    stack?: string // Only in development
  }
  metadata?: {
    timestamp?: string
    requestId?: string
    [key: string]: unknown
  }
}

/**
 * Combined API response type
 * Uses discriminated union for type narrowing
 */
export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

/**
 * Firebase Callable Context
 * Authentication and request context provided by Firebase
 */
export interface CallableContext {
  auth?: {
    uid: string
    token: Record<string, unknown>
  }
  rawRequest?: unknown
  instanceIdToken?: string
  app?: unknown
}

/**
 * Generic Firebase callable request wrapper
 * Wraps request data with Firebase context
 */
export interface CallableRequest<T> {
  data: T
  context: CallableContext
}

/**
 * Generic Firebase callable response
 * Firebase callables return ApiResponse structure
 */
export type CallableResponse<T> = ApiResponse<T>

/**
 * Pagination parameters for list requests
 */
export interface PaginationParams {
  limit?: number
  offset?: number
  cursor?: string
}

/**
 * Pagination metadata in responses
 */
export interface PaginationMeta {
  limit: number
  offset: number
  total?: number
  hasMore?: boolean
  nextCursor?: string
}

/**
 * Paginated API response
 */
export interface PaginatedApiResponse<T> extends ApiSuccessResponse<T[]> {
  data: T[]
  pagination: PaginationMeta
}

/**
 * Helper type for API function signatures
 */
export type ApiFunction<TRequest, TResponse> = (
  request: TRequest
) => Promise<ApiResponse<TResponse>>

/**
 * Helper type for Firebase callable function signatures
 */
export type CallableFunction<TRequest, TResponse> = (
  data: TRequest,
  context: CallableContext
) => Promise<CallableResponse<TResponse>>
