/**
 * Base API Client
 *
 * Provides common HTTP methods with:
 * - Automatic auth token injection
 * - Error handling and retry logic
 * - Request/response logging
 */

import { DEFAULT_E2E_AUTH_TOKEN, TEST_AUTH_TOKEN_KEY, AUTH_BYPASS_ENABLED } from "@/config/testing"
import { clearStoredAuthToken, getStoredAuthToken } from "@/lib/auth-storage"
import { decodeJwt } from "@/lib/jwt"
import { ApiErrorCode, type ApiErrorResponse } from "@shared/types"
import { handleApiError } from "@/lib/api-error-handler"

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH"
  headers?: Record<string, string>
  body?: unknown
  timeout?: number
  retryAttempts?: number
  retryDelay?: number
}

export class ApiError extends Error {
  statusCode?: number
  response?: unknown
  code?: ApiErrorCode | string
  details?: Record<string, unknown>

  constructor(message: string, statusCode?: number, response?: unknown, code?: ApiErrorCode | string) {
    super(message)
    this.name = "ApiError"
    this.statusCode = statusCode
    this.response = response
    this.code = code
    this.details = (response as ApiErrorResponse | undefined)?.error?.details
  }
}

export class BaseApiClient {
  private baseUrlResolver: () => string
  defaultTimeout: number
  defaultRetryAttempts: number
  defaultRetryDelay: number

  constructor(
    baseUrl: string | (() => string),
    options?: {
      timeout?: number
      retryAttempts?: number
      retryDelay?: number
    }
  ) {
    // Support both static strings and dynamic resolvers
    this.baseUrlResolver = typeof baseUrl === "function" ? baseUrl : () => baseUrl
    this.defaultTimeout = options?.timeout || 30000
    this.defaultRetryAttempts = options?.retryAttempts || 3
    this.defaultRetryDelay = options?.retryDelay || 1000
  }

  get baseUrl(): string {
    return this.baseUrlResolver()
  }

  /**
   * Get current user's auth token
   */
  async getAuthToken(): Promise<string | null> {
    const bypassToken = getBypassTokenOverride()
    if (bypassToken) {
      return bypassToken
    }

    const stored = getStoredAuthToken()
    if (stored && isJwtExpired(stored)) {
      clearStoredAuthToken()
      return null
    }

    return stored
  }

  /**
   * Make HTTP request with retry logic
   */
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const {
      method = "GET",
      headers = {},
      body,
      timeout = this.defaultTimeout,
      retryAttempts = this.defaultRetryAttempts,
      retryDelay = this.defaultRetryDelay,
    } = options

    const url = `${this.baseUrl}${endpoint}`

    // Get auth token
    const token = await this.getAuthToken()

    // Build headers
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      ...headers,
    }

    if (token) {
      requestHeaders["Authorization"] = `Bearer ${token}`
    }


    // Build request options
    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
      cache: "no-store",
      credentials: "include",
      signal: AbortSignal.timeout(timeout),
    }

    if (body && method !== "GET") {
      fetchOptions.body = JSON.stringify(body)
    }

    // Retry logic
    let lastError: Error | null = null
    let attemptedSessionRetry = false
    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const response = await fetch(url, fetchOptions)

        // Handle non-2xx responses
        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as ApiErrorResponse | Record<string, unknown>
          const apiErrorPayload = (errorData as ApiErrorResponse).error
          const code = apiErrorPayload?.code ?? ApiErrorCode.INTERNAL_ERROR
          const message = apiErrorPayload?.message || `HTTP ${response.status}: ${response.statusText}`
          throw new ApiError(message, response.status, errorData, code)
        }

        // Parse response
        const contentType = response.headers.get("content-type")
        if (contentType?.includes("application/json")) {
          return (await response.json()) as T
        }

        // Return empty object for non-JSON responses
        return {} as T
      } catch (error) {
        lastError = error as Error

        // Special-case 401: clear stale bearer token once and retry using the session cookie
        if (
          error instanceof ApiError &&
          error.statusCode === 401 &&
          !attemptedSessionRetry &&
          requestHeaders["Authorization"]
        ) {
          attemptedSessionRetry = true
          clearStoredAuthToken()
          delete requestHeaders["Authorization"]
          // retry immediately without counting toward backoff attempts
          continue
        }

        // Don't retry on other client errors (4xx)
        if (
          error instanceof ApiError &&
          error.statusCode &&
          error.statusCode >= 400 &&
          error.statusCode < 500
        ) {
          handleApiError(error, { context: `${method} ${url}` })
          throw error
        }

        // Wait before retry (exponential backoff)
        if (attempt < retryAttempts - 1) {
          const delay = retryDelay * Math.pow(2, attempt)
          await new Promise((resolve) => setTimeout(resolve, delay))
        }
      }
    }

    // All retries failed
    const finalError =
      lastError || new ApiError("Request failed after all retry attempts", undefined, undefined, ApiErrorCode.INTERNAL_ERROR)
    handleApiError(finalError, { context: `${method} ${url}` })
    throw finalError
  }

  /**
   * HTTP GET request
   */
  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "GET" })
  }

  /**
   * HTTP POST request
   */
  async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "POST", body })
  }

  /**
   * HTTP PUT request
   */
  async put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "PUT", body })
  }

  /**
   * HTTP DELETE request
   */
  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "DELETE" })
  }

  /**
   * HTTP PATCH request
   */
  async patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "PATCH", body })
  }

}

function getBypassTokenOverride(): string | null {
  if (!AUTH_BYPASS_ENABLED) {
    return null
  }
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(TEST_AUTH_TOKEN_KEY)
    if (stored) {
      return stored
    }
  }

  return DEFAULT_E2E_AUTH_TOKEN || null
}

function isJwtExpired(token: string): boolean {
  try {
    const payload = decodeJwt(token)
    if (!payload.exp) {
      return false
    }
    const expiresAtMs = payload.exp * 1000
    return Date.now() >= expiresAtMs
  } catch (error) {
    // If the token cannot be decoded, treat it as expired to force re-auth
    console.warn("Failed to decode auth token; treating as expired", error)
    return true
  }
}
