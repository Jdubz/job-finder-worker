import { API_CONFIG } from "@/config/api"
import { BaseApiClient, ApiError } from "./base-client"
import type { LoginResponseData, SessionResponseData, ApiSuccessResponse } from "@shared/types"

// Re-export types for consumers that import from auth-client
export type { SessionUser, LoginResponseData, SessionResponseData } from "@shared/types"

export type LoginResponse = LoginResponseData
export type SessionResponse = SessionResponseData

/**
 * Auth-specific error with status code.
 * Extends ApiError for compatibility while maintaining auth-specific semantics.
 */
export class AuthError extends ApiError {
  constructor(message: string, statusCode: number) {
    super(message, statusCode, undefined, "AUTH_ERROR")
    this.name = "AuthError"
  }
}

/**
 * Auth client for session-based authentication.
 * Extends BaseApiClient for consistent HTTP handling, retry logic, and error handling.
 * All requests use credentials: 'include' to send/receive cookies.
 */
class AuthClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string), options?: { timeout?: number }) {
    super(baseUrl, {
      timeout: options?.timeout ?? 30000,
      retryAttempts: 3,
      retryDelay: 500,
    })
  }

  /**
   * Exchange a Google OAuth credential for a session cookie.
   * This is the single entry point for authentication.
   */
  async login(credential: string): Promise<LoginResponse> {
    try {
      const response = await this.post<ApiSuccessResponse<LoginResponseData>>(
        "/auth/login",
        { credential },
        { retryAttempts: 1 } // Don't retry auth requests
      )
      return response.data
    } catch (error) {
      if (error instanceof ApiError) {
        throw new AuthError(error.message, error.statusCode ?? 500)
      }
      throw error
    }
  }

  /**
   * Restore session from cookie.
   * Returns user info if session is valid, throws if not.
   * Retries on network errors with exponential backoff.
   */
  async fetchSession(): Promise<SessionResponse> {
    try {
      const response = await this.get<ApiSuccessResponse<SessionResponseData>>("/auth/session")
      return response.data
    } catch (error) {
      if (error instanceof ApiError) {
        throw new AuthError(error.message, error.statusCode ?? 500)
      }
      throw error
    }
  }

  /**
   * Clear session cookie and invalidate server-side session.
   */
  async logout(): Promise<{ loggedOut: boolean }> {
    try {
      const response = await this.post<ApiSuccessResponse<{ loggedOut: boolean }>>(
        "/auth/logout",
        undefined,
        { retryAttempts: 1 } // Don't retry logout
      )
      return response.data
    } catch (error) {
      if (error instanceof ApiError) {
        throw new AuthError(error.message, error.statusCode ?? 500)
      }
      throw error
    }
  }
}

export const authClient = new AuthClient(() => API_CONFIG.baseUrl, {
  timeout: API_CONFIG.timeout,
})
