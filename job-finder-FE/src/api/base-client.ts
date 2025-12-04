/**
 * Base API Client
 *
 * Provides common HTTP methods with:
 * - Cookie-based authentication (credentials: include)
 * - Error handling and retry logic
 * - Request/response logging
 */

import { ApiErrorCode, type ApiErrorResponse } from '@shared/types'
import { handleApiError } from '@/lib/api-error-handler'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
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

  constructor(
    message: string,
    statusCode?: number,
    response?: unknown,
    code?: ApiErrorCode | string
  ) {
    super(message)
    this.name = 'ApiError'
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
    this.baseUrlResolver = typeof baseUrl === 'function' ? baseUrl : () => baseUrl
    this.defaultTimeout = options?.timeout || 30000
    this.defaultRetryAttempts = options?.retryAttempts || 3
    this.defaultRetryDelay = options?.retryDelay || 1000
  }

  get baseUrl(): string {
    return this.baseUrlResolver()
  }

  /**
   * Make HTTP request with retry logic.
   * Authentication is handled via cookies (credentials: include).
   */
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.defaultTimeout,
      retryAttempts = this.defaultRetryAttempts,
      retryDelay = this.defaultRetryDelay,
    } = options

    const url = `${this.baseUrl}${endpoint}`

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      ...headers,
    }

    const fetchOptions: RequestInit = {
      method,
      headers: requestHeaders,
      cache: 'no-store',
      credentials: 'include', // Send cookies with every request
      signal: AbortSignal.timeout(timeout),
    }

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body)
    }

    let lastError: Error | null = null

    for (let attempt = 0; attempt < retryAttempts; attempt++) {
      try {
        const response = await fetch(url, fetchOptions)

        if (!response.ok) {
          const errorData = (await response.json().catch(() => ({}))) as
            | ApiErrorResponse
            | Record<string, unknown>
          const apiErrorPayload = (errorData as ApiErrorResponse).error
          const code = apiErrorPayload?.code ?? ApiErrorCode.INTERNAL_ERROR
          const message =
            apiErrorPayload?.message || `HTTP ${response.status}: ${response.statusText}`
          throw new ApiError(message, response.status, errorData, code)
        }

        const contentType = response.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          return (await response.json()) as T
        }

        return {} as T
      } catch (error) {
        lastError = error as Error

        // Don't retry on client errors (4xx) - they won't succeed
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

    const finalError =
      lastError ||
      new ApiError(
        'Request failed after all retry attempts',
        undefined,
        undefined,
        ApiErrorCode.INTERNAL_ERROR
      )
    handleApiError(finalError, { context: `${method} ${url}` })
    throw finalError
  }

  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'GET' })
  }

  async post<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'POST', body })
  }

  async put<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PUT', body })
  }

  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'DELETE' })
  }

  async patch<T>(endpoint: string, body?: unknown, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: 'PATCH', body })
  }
}
