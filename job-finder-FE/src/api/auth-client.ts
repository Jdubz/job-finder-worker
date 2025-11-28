import { API_CONFIG } from '@/config/api'

export interface SessionUser {
  uid: string
  email: string
  name?: string
  picture?: string
  roles?: string[]
}

export interface SessionResponse {
  user: SessionUser
}

export interface LoginResponse {
  user: SessionUser
}

/**
 * Auth client for session-based authentication.
 * All requests use credentials: 'include' to send/receive cookies.
 * No Bearer tokens - authentication is cookie-based only.
 */
class AuthClient {
  private baseUrl: string
  private timeout: number

  constructor(baseUrl: string, options?: { timeout?: number }) {
    this.baseUrl = baseUrl
    this.timeout = options?.timeout ?? 30000
  }

  /**
   * Exchange a Google OAuth credential for a session cookie.
   * This is the single entry point for authentication.
   */
  async login(credential: string): Promise<LoginResponse> {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ credential }),
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new AuthError(
        error.error?.message || `Login failed: ${response.status}`,
        response.status
      )
    }

    return response.json()
  }

  /**
   * Restore session from cookie.
   * Returns user info if session is valid, throws if not.
   */
  async fetchSession(): Promise<SessionResponse> {
    const response = await fetch(`${this.baseUrl}/auth/session`, {
      method: 'GET',
      credentials: 'include',
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new AuthError(
        error.error?.message || `Session fetch failed: ${response.status}`,
        response.status
      )
    }

    return response.json()
  }

  /**
   * Clear session cookie and invalidate server-side session.
   */
  async logout(): Promise<{ loggedOut: boolean }> {
    const response = await fetch(`${this.baseUrl}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
      signal: AbortSignal.timeout(this.timeout),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new AuthError(
        error.error?.message || `Logout failed: ${response.status}`,
        response.status
      )
    }

    return response.json()
  }
}

export class AuthError extends Error {
  statusCode: number

  constructor(message: string, statusCode: number) {
    super(message)
    this.name = 'AuthError'
    this.statusCode = statusCode
  }
}

export const authClient = new AuthClient(API_CONFIG.baseUrl, {
  timeout: API_CONFIG.timeout,
})
