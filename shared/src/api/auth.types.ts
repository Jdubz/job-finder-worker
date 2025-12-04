/**
 * Auth API Types
 *
 * Types for authentication endpoints (login, session, logout).
 * Used by both job-finder-BE (auth routes) and job-finder-FE (auth client).
 */

/**
 * Authenticated user returned from auth endpoints.
 * Represents the user info stored in session.
 */
export interface SessionUser {
  uid: string
  email: string
  name?: string
  picture?: string
  roles?: string[]
}

/**
 * Login request payload
 */
export interface LoginRequest {
  credential: string
}

/**
 * Login response data (unwrapped from ApiSuccessResponse)
 */
export interface LoginResponseData {
  user: SessionUser
}

/**
 * Session response data (unwrapped from ApiSuccessResponse)
 */
export interface SessionResponseData {
  user: SessionUser
}

/**
 * Logout response data (unwrapped from ApiSuccessResponse)
 */
export interface LogoutResponseData {
  loggedOut: boolean
}
