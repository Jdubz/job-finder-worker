import { describe, expect, it, vi, beforeEach } from "vitest"
import { ApiErrorCode, getApiErrorDefinition, type ApiErrorResponse } from "@shared/types"
import { ApiError } from "@/api/base-client"
import { handleApiError, normalizeApiError } from "@/lib/api-error-handler"

const toastError = vi.fn()

vi.mock("@/components/toast", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}))

vi.mock("@/services/logging/FrontendLogger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    debug: vi.fn(),
  },
}))

describe("api error handler", () => {
  beforeEach(() => {
    toastError.mockClear()
  })

  it("normalizes ApiError with response payload", () => {
    const payload: ApiErrorResponse = {
      success: false,
      error: {
        code: ApiErrorCode.INVALID_REQUEST,
        message: "Invalid input",
        details: { field: "email" },
      },
    }

    const apiError = new ApiError("Invalid input", 400, payload, ApiErrorCode.INVALID_REQUEST)
    const normalized = normalizeApiError(apiError)

    expect(normalized.code).toBe(ApiErrorCode.INVALID_REQUEST)
    expect(normalized.message).toBe("Invalid input")
    expect(normalized.details).toEqual({ field: "email" })
  })

  it("shows user-friendly toast when handling error", () => {
    const definition = getApiErrorDefinition(ApiErrorCode.RATE_LIMIT_EXCEEDED)
    const apiError = new ApiError(definition.defaultMessage, 429, {
      success: false,
      error: { code: ApiErrorCode.RATE_LIMIT_EXCEEDED, message: definition.defaultMessage },
    } as ApiErrorResponse)

    const normalized = handleApiError(apiError)

    expect(normalized.code).toBe(ApiErrorCode.RATE_LIMIT_EXCEEDED)
    expect(toastError).toHaveBeenCalledTimes(1)
    expect(toastError).toHaveBeenCalledWith({
      title: definition.userMessage,
      description: undefined,
    })
  })

  it("respects silent option and skips toast", () => {
    const apiError = new ApiError("Oops", 500)
    handleApiError(apiError, { silent: true })

    expect(toastError).not.toHaveBeenCalled()
  })
})
