// @ts-nocheck
/**
 * Test Helper Utilities
 *
 * Shared utilities for integration and E2E tests
 */

import { signInWithEmailAndPassword, signOut, createUserWithEmailAndPassword } from "firebase/auth"
import { auth } from "@/config/firebase"
import { describe } from "vitest"

/**
 * Check if Firebase is mocked (running in unit test mode)
 * Uses environment variable for configuration instead of runtime type checking
 */
export function isFirebaseMocked(): boolean {
  return process.env.FIREBASE_MOCKED === "true"
}

/**
 * Get the appropriate describe function for integration tests
 * Returns describe.skip if Firebase is mocked, otherwise returns describe
 */
export function getIntegrationDescribe(): typeof describe {
  return isFirebaseMocked() ? describe.skip : describe
}

/**
 * Test user credentials
 */
export const TEST_USERS = {
  regular: {
    email: process.env.VITE_TEST_USER_EMAIL || "test@example.com",
    password: process.env.VITE_TEST_USER_PASSWORD || "testpassword123",
  },
  editor: {
    email: process.env.VITE_TEST_EDITOR_EMAIL || "editor@example.com",
    password: process.env.VITE_TEST_EDITOR_PASSWORD || "editorpassword123",
  },
}

/**
 * Get authentication token for test user
 */
export async function getTestAuthToken(
  userType: "regular" | "editor" = "regular"
): Promise<string> {
  const { email, password } = TEST_USERS[userType]

  if (!email || !password) {
    throw new Error("Test credentials not configured")
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    return await userCredential.user.getIdToken()
  } catch (error) {
    const errorCode = (error as { code?: string }).code

    // If user doesn't exist in emulator, create it
    if (errorCode === "auth/user-not-found" || errorCode === "auth/invalid-credential") {
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password)
        return await userCredential.user.getIdToken()
      } catch (createError) {
        const createErrorCode = (createError as { code?: string }).code

        // If user was created between our check and create attempt, try signing in again
        if (createErrorCode === "auth/email-already-in-use") {
          const userCredential = await signInWithEmailAndPassword(auth, email, password)
          return await userCredential.user.getIdToken()
        }
        throw createError
      }
    }
    throw error
  }
}

/**
 * Sign in test user and return auth token
 */
export async function signInTestUser(userType: "regular" | "editor" = "regular") {
  const { email, password } = TEST_USERS[userType]

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    return userCredential.user
  } catch (error) {
    const errorCode = (error as { code?: string }).code

    // If user doesn't exist in emulator, create it
    if (errorCode === "auth/user-not-found" || errorCode === "auth/invalid-credential") {
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password)
        return userCredential.user
      } catch (createError) {
        const createErrorCode = (createError as { code?: string }).code

        // If user was created between our check and create attempt, try signing in again
        if (createErrorCode === "auth/email-already-in-use") {
          const userCredential = await signInWithEmailAndPassword(auth, email, password)
          return userCredential.user
        }
        throw createError
      }
    }
    throw error
  }
}

/**
 * Clean up test authentication
 */
export async function cleanupTestAuth() {
  try {
    await signOut(auth)
  } catch (error) {
    // Ignore errors during cleanup
    console.warn("Failed to sign out during cleanup:", error)
  }
}

/**
 * Make authenticated API request
 */
export async function makeAuthenticatedRequest(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const token = await getTestAuthToken()

  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
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
