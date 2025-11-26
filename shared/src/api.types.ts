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
 * Optional metadata describing an API error code.
 *
 * httpStatus: the HTTP status the backend should return for this code
 * defaultMessage: developer-facing default message
 * userMessage: safe user-facing copy for the UI (optional)
 * retryable: whether the frontend may retry automatically
 */
export interface ApiErrorDefinition {
  code: ApiErrorCode
  httpStatus: number
  defaultMessage: string
  userMessage?: string
  retryable?: boolean
}

export const API_ERROR_DEFINITIONS: Record<ApiErrorCode, ApiErrorDefinition> = {
  [ApiErrorCode.UNAUTHORIZED]: {
    code: ApiErrorCode.UNAUTHORIZED,
    httpStatus: 401,
    defaultMessage: "Authentication required",
    userMessage: "Please sign in to continue."
  },
  [ApiErrorCode.FORBIDDEN]: {
    code: ApiErrorCode.FORBIDDEN,
    httpStatus: 403,
    defaultMessage: "You don't have permission to perform this action",
    userMessage: "You don't have access to do that."
  },
  [ApiErrorCode.TOKEN_EXPIRED]: {
    code: ApiErrorCode.TOKEN_EXPIRED,
    httpStatus: 401,
    defaultMessage: "Authentication token has expired",
    userMessage: "Your session expired. Please sign in again.",
    retryable: false
  },
  [ApiErrorCode.INVALID_TOKEN]: {
    code: ApiErrorCode.INVALID_TOKEN,
    httpStatus: 401,
    defaultMessage: "Invalid authentication token",
    userMessage: "There was a problem with your session. Please sign in again.",
    retryable: false
  },
  [ApiErrorCode.INVALID_REQUEST]: {
    code: ApiErrorCode.INVALID_REQUEST,
    httpStatus: 400,
    defaultMessage: "Request payload is invalid",
    userMessage: "Please double-check the information you entered.",
    retryable: false
  },
  [ApiErrorCode.MISSING_FIELD]: {
    code: ApiErrorCode.MISSING_FIELD,
    httpStatus: 400,
    defaultMessage: "Required field is missing",
    userMessage: "Looks like something is missing. Please fill out all required fields.",
    retryable: false
  },
  [ApiErrorCode.INVALID_FIELD]: {
    code: ApiErrorCode.INVALID_FIELD,
    httpStatus: 422,
    defaultMessage: "Field value is invalid",
    userMessage: "One of the fields has an invalid value.",
    retryable: false
  },
  [ApiErrorCode.VALIDATION_FAILED]: {
    code: ApiErrorCode.VALIDATION_FAILED,
    httpStatus: 422,
    defaultMessage: "Request failed validation",
    userMessage: "Please fix the highlighted issues and try again.",
    retryable: false
  },
  [ApiErrorCode.NOT_FOUND]: {
    code: ApiErrorCode.NOT_FOUND,
    httpStatus: 404,
    defaultMessage: "Resource not found",
    userMessage: "We couldn't find what you were looking for.",
    retryable: false
  },
  [ApiErrorCode.ALREADY_EXISTS]: {
    code: ApiErrorCode.ALREADY_EXISTS,
    httpStatus: 409,
    defaultMessage: "Resource already exists",
    userMessage: "This already exists.",
    retryable: false
  },
  [ApiErrorCode.RESOURCE_CONFLICT]: {
    code: ApiErrorCode.RESOURCE_CONFLICT,
    httpStatus: 409,
    defaultMessage: "Resource conflict",
    userMessage: "Your change couldn't be saved because it conflicted with another update.",
    retryable: false
  },
  [ApiErrorCode.GENERATION_FAILED]: {
    code: ApiErrorCode.GENERATION_FAILED,
    httpStatus: 500,
    defaultMessage: "Generation pipeline failed",
    userMessage: "We couldn't generate the document. Please try again.",
    retryable: true
  },
  [ApiErrorCode.AI_SERVICE_ERROR]: {
    code: ApiErrorCode.AI_SERVICE_ERROR,
    httpStatus: 502,
    defaultMessage: "AI provider returned an error",
    userMessage: "Our AI service ran into an issue. Please try again.",
    retryable: true
  },
  [ApiErrorCode.PDF_GENERATION_FAILED]: {
    code: ApiErrorCode.PDF_GENERATION_FAILED,
    httpStatus: 500,
    defaultMessage: "PDF generation failed",
    userMessage: "We couldn't generate your PDF. Please try again.",
    retryable: true
  },
  [ApiErrorCode.STORAGE_ERROR]: {
    code: ApiErrorCode.STORAGE_ERROR,
    httpStatus: 500,
    defaultMessage: "Storage operation failed",
    userMessage: "We couldn't access a file we need. Please try again.",
    retryable: true
  },
  [ApiErrorCode.RATE_LIMIT_EXCEEDED]: {
    code: ApiErrorCode.RATE_LIMIT_EXCEEDED,
    httpStatus: 429,
    defaultMessage: "Rate limit exceeded",
    userMessage: "You're doing that too often. Please slow down.",
    retryable: true
  },
  [ApiErrorCode.QUOTA_EXCEEDED]: {
    code: ApiErrorCode.QUOTA_EXCEEDED,
    httpStatus: 429,
    defaultMessage: "Quota exceeded",
    userMessage: "You've hit your quota. Please wait and try again later.",
    retryable: true
  },
  [ApiErrorCode.INTERNAL_ERROR]: {
    code: ApiErrorCode.INTERNAL_ERROR,
    httpStatus: 500,
    defaultMessage: "Unexpected internal error",
    userMessage: "Something went wrong on our side. Please try again.",
    retryable: true
  },
  [ApiErrorCode.SERVICE_UNAVAILABLE]: {
    code: ApiErrorCode.SERVICE_UNAVAILABLE,
    httpStatus: 503,
    defaultMessage: "Service temporarily unavailable",
    userMessage: "The service is temporarily unavailable. Please try again soon.",
    retryable: true
  },
  [ApiErrorCode.TIMEOUT]: {
    code: ApiErrorCode.TIMEOUT,
    httpStatus: 504,
    defaultMessage: "Request timed out",
    userMessage: "This is taking longer than expected. Please try again.",
    retryable: true
  },
  [ApiErrorCode.DATABASE_ERROR]: {
    code: ApiErrorCode.DATABASE_ERROR,
    httpStatus: 500,
    defaultMessage: "Database error",
    userMessage: "We couldn't complete your request due to a data error.",
    retryable: true
  }
}

export const DEFAULT_API_ERROR_DEFINITION: ApiErrorDefinition = API_ERROR_DEFINITIONS[ApiErrorCode.INTERNAL_ERROR]

export const getApiErrorDefinition = (code?: ApiErrorCode | string | null): ApiErrorDefinition => {
  if (!code) return DEFAULT_API_ERROR_DEFINITION
  if (Object.prototype.hasOwnProperty.call(API_ERROR_DEFINITIONS, code)) {
    return API_ERROR_DEFINITIONS[code as ApiErrorCode]
  }
  return DEFAULT_API_ERROR_DEFINITION
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
