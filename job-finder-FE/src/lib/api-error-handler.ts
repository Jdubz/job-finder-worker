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
    toast.error({
      title: options?.toastTitle ?? definition.userMessage ?? normalized.message,
      description: options?.toastTitle ? normalized.message : undefined,
    })
  }

  return normalized
}
