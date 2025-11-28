/**
 * Test Helper Utilities
 *
 * Shared utilities for integration and E2E tests.
 * Authentication is now cookie-based - tests use credentials: include.
 */

import { describe } from "vitest"
import { DEFAULT_E2E_AUTH_TOKEN } from "@/config/testing"

type TestUser = {
  id: string
  email: string
  name: string
  roles: string[]
}

const TEST_USERS: Record<"regular" | "editor", TestUser> = {
  regular: {
    id: "test-regular-user",
    email: process.env.VITE_TEST_USER_EMAIL || "test@example.com",
    name: "Regular Tester",
    roles: ["admin"],
  },
  editor: {
    id: "test-editor-user",
    email: process.env.VITE_TEST_EDITOR_EMAIL || "editor@example.com",
    name: "Editor Tester",
    roles: ["admin"],
  },
}

const AUTH_BYPASS_TOKEN =
  process.env.VITE_E2E_AUTH_TOKEN ||
  process.env.TEST_AUTH_BYPASS_TOKEN ||
  DEFAULT_E2E_AUTH_TOKEN

let currentUser: TestUser | null = null

export { TEST_USERS }

/**
 * Integration tests now always run because they use cookie-based auth.
 */
export function getIntegrationDescribe(): typeof describe {
  return describe
}

/**
 * Sign in a synthetic test user.
 * In the new cookie-based auth, this is mostly a no-op for tracking purposes.
 * Actual auth happens via the session cookie set by the backend.
 */
export async function signInTestUser(userType: "regular" | "editor" = "regular") {
  currentUser = TEST_USERS[userType]
  return currentUser
}

/**
 * Resolve the auth token that can be used for test bypass.
 * This is used for tests that need to send a Bearer token (e.g., for dev mode).
 */
export async function getTestAuthToken(
  userType: "regular" | "editor" = "regular"
): Promise<string> {
  if (!currentUser || currentUser !== TEST_USERS[userType]) {
    await signInTestUser(userType)
  }
  return AUTH_BYPASS_TOKEN
}

/**
 * Clear any synthetic auth state between tests.
 */
export async function cleanupTestAuth() {
  currentUser = null
}

/**
 * Make authenticated API request using credentials: include for cookies.
 * Falls back to Bearer token for compatibility with dev mode.
 */
export async function makeAuthenticatedRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getTestAuthToken()

  return fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      // Include Bearer token for dev mode compatibility
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  })
}

/**
 * Make unauthenticated API request (for testing auth failures)
 */
export async function makeUnauthenticatedRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "Content-Type": "application/json",
    },
  })
}

/**
 * Wait for async operation with timeout
 */
export async function waitFor<T>(
  fn: () => Promise<T>,
  options: {
    timeout?: number
    interval?: number
    errorMessage?: string
  } = {}
): Promise<T> {
  const { timeout = 5000, interval = 100, errorMessage = "Timeout waiting for condition" } = options

  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      return await fn()
    } catch {
      if (Date.now() - startTime >= timeout) {
        throw new Error(errorMessage)
      }
      await new Promise((resolve) => setTimeout(resolve, interval))
    }
  }

  throw new Error(errorMessage)
}

/**
 * Generate random test ID
 */
export function generateTestId(prefix = "test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Delay execution
 */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Assert response is successful
 */
export function assertSuccessResponse(response: Response, message?: string) {
  if (!response.ok) {
    throw new Error(message || `Request failed with status ${response.status}`)
  }
}

/**
 * Assert response has specific status code
 */
export function assertResponseStatus(response: Response, expectedStatus: number, message?: string) {
  if (response.status !== expectedStatus) {
    throw new Error(message || `Expected status ${expectedStatus} but got ${response.status}`)
  }
}

/**
 * Parse JSON response safely
 */
export async function parseJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Failed to parse JSON response: ${text}`)
  }
}

/**
 * Retry operation with exponential backoff
 */
export async function retryOperation<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number
    initialDelay?: number
    maxDelay?: number
    backoffMultiplier?: number
  } = {}
): Promise<T> {
  const { maxRetries = 3, initialDelay = 1000, maxDelay = 10000, backoffMultiplier = 2 } = options

  let lastError: Error | null = null
  let currentDelay = initialDelay

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error as Error

      if (attempt < maxRetries - 1) {
        await delay(Math.min(currentDelay, maxDelay))
        currentDelay *= backoffMultiplier
      }
    }
  }

  throw lastError || new Error("Operation failed after all retries")
}
