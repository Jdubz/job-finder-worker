import { ApiErrorCode, getApiErrorDefinition, type ApiErrorResponse } from "@shared/types"
import { ApiError } from "@/api/base-client"
import { toast } from "@/components/toast"
import { logger } from "@/services/logging/FrontendLogger"
import { isAppRestarting } from "@/lib/restart-state"

export interface NormalizedApiError {
  code: ApiErrorCode | string
  message: string
  status?: number
  details?: Record<string, unknown>
  raw: unknown
}

/** Minimum message length to consider it "specific" rather than a generic default */
const MIN_SPECIFIC_MESSAGE_LENGTH = 10

/**
 * Check if an error is a conflict/already-exists error (HTTP 409)
 */
export const isConflictError = (error: unknown): boolean => {
  const normalized = normalizeApiError(error)
  return normalized.code === ApiErrorCode.ALREADY_EXISTS ||
         normalized.code === ApiErrorCode.RESOURCE_CONFLICT ||
         normalized.status === 409
}

/**
 * Check if an error is a not-found error (HTTP 404)
 */
export const isNotFoundError = (error: unknown): boolean => {
  const normalized = normalizeApiError(error)
  return normalized.code === ApiErrorCode.NOT_FOUND || normalized.status === 404
}

/**
 * Check if an error is a validation error (HTTP 400/422)
 */
export const isValidationError = (error: unknown): boolean => {
  const normalized = normalizeApiError(error)
  return normalized.code === ApiErrorCode.INVALID_REQUEST ||
         normalized.code === ApiErrorCode.MISSING_FIELD ||
         normalized.code === ApiErrorCode.INVALID_FIELD ||
         normalized.code === ApiErrorCode.VALIDATION_FAILED ||
         normalized.status === 400 ||
         normalized.status === 422
}

/**
 * Get the conflicting resource ID from an error's details (if available)
 */
export const getConflictingResourceId = (error: unknown): string | undefined => {
  const normalized = normalizeApiError(error)
  if (!isConflictError(error)) return undefined
  // Check common patterns for conflict details
  return (normalized.details?.listingId as string | undefined) ||
         (normalized.details?.resourceId as string | undefined) ||
         (normalized.details?.id as string | undefined)
}

export const normalizeApiError = (error: unknown, fallbackMessage?: string): NormalizedApiError => {
  if (error instanceof ApiError) {
    const responseBody = error.response as ApiErrorResponse | undefined
    const code = responseBody?.error?.code ?? error.code ?? ApiErrorCode.INTERNAL_ERROR
    return {
      code,
      message: error.message || getApiErrorDefinition(code).defaultMessage,
      status: error.statusCode,
      details: responseBody?.error?.details,
      raw: error,
    }
  }

  if (error && typeof error === "object") {
    const apiErrorResponse = (error as ApiErrorResponse | undefined)?.error
    const code = apiErrorResponse?.code ?? ApiErrorCode.INTERNAL_ERROR
    if (apiErrorResponse?.message) {
      return {
        code,
        message: apiErrorResponse.message,
        details: apiErrorResponse.details,
        raw: error,
      }
    }
  }

  if (error instanceof Error) {
    return {
      code: ApiErrorCode.INTERNAL_ERROR,
      message: error.message || fallbackMessage || getApiErrorDefinition(ApiErrorCode.INTERNAL_ERROR).defaultMessage,
      status: undefined,
      raw: error,
    }
  }

  return {
    code: ApiErrorCode.INTERNAL_ERROR,
    message: fallbackMessage || getApiErrorDefinition(ApiErrorCode.INTERNAL_ERROR).defaultMessage,
    raw: error,
  }
}

export const handleApiError = (
  error: unknown,
  options?: {
    context?: string
    silent?: boolean
    fallbackMessage?: string
    toastTitle?: string
    details?: Record<string, unknown>
  }
): NormalizedApiError => {
  const normalized = normalizeApiError(error, options?.fallbackMessage)
  const definition = getApiErrorDefinition(normalized.code)
  const restarting = isAppRestarting()

  if (!restarting) {
    logger.error("client", "api_error", normalized.message, {
      error: error instanceof Error
        ? { type: error.name, message: error.message, stack: error.stack }
        : undefined,
      details: {
        context: options?.context,
        code: normalized.code,
        status: normalized.status,
        retryable: definition.retryable ?? false,
        ...options?.details,
        raw: normalized.raw as Record<string, unknown> | undefined,
      },
    })
  }

  if (!options?.silent && !restarting) {
    // For conflict errors (409), prefer the specific API message over the generic userMessage
    // since the API provides actionable context (e.g., "A re-analysis task for this company is already in the queue")
    const isConflict = isConflictError(error)
    const hasSpecificApiMessage = normalized.message &&
                                   normalized.message !== definition.defaultMessage &&
                                   normalized.message.length > MIN_SPECIFIC_MESSAGE_LENGTH

    const title = options?.toastTitle ??
                  (isConflict && hasSpecificApiMessage ? normalized.message : definition.userMessage) ??
                  normalized.message

    toast.error({
      title,
      description: options?.toastTitle ? normalized.message : undefined,
    })
  }

  return normalized
}
