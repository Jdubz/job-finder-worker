/**
 * API Configuration for job-finder-BE
 *
 * Provides centralized configuration for all backend API endpoints.
 * Backend (job-finder-BE) is deployed to static-sites-257923 Firebase project.
 * Supports environment-specific URLs for development, staging, and production.
 *
 * Environment Configuration:
 * - Development: Firebase emulators (static-sites-257923 project, default database)
 * - Staging: static-sites-257923 Firebase project (portfolio-staging database)
 * - Production: static-sites-257923 Firebase project (portfolio database)
 */

const isStaging = import.meta.env.MODE === "staging"
const rawApiBase =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.VITE_USE_EMULATORS === "true" ? "http://localhost:8080" : "http://localhost:8080")
const normalizedApiBase = rawApiBase.replace(/\/$/, "")
const restBaseUrl = `${normalizedApiBase}/api`
const generatorBaseUrl = `${restBaseUrl}/generator`

// Functions API (legacy Firebase Cloud Functions)
const rawFunctionsBase =
  import.meta.env.VITE_FUNCTIONS_BASE_URL ||
  "https://us-central1-static-sites-257923.cloudfunctions.net"
const functionsBaseUrl = rawFunctionsBase.replace(/\/$/, "")
const FUNCTION_SUFFIX = isStaging ? "-staging" : ""

/**
 * API Configuration
 */
export const API_CONFIG = {
  baseUrl: restBaseUrl,
  generatorBaseUrl,
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
}

/**
 * Firebase Cloud Functions endpoints
 * Note: Staging functions use -staging suffix, production has no suffix
 */
export const api = {
  baseUrl: restBaseUrl,
  generatorBaseUrl,

  // Firebase Functions endpoints (legacy)
  functions: {
    // Document generation
    manageGenerator: `${functionsBaseUrl}/manageGenerator${FUNCTION_SUFFIX}`,
  },
}

/**
 * Helper function for authenticated requests
 */
export async function authenticatedFetch(
  url: string,
  options: RequestInit = {},
  authToken: string
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${authToken}`,
      "Content-Type": "application/json",
    },
  })
}

// Legacy exports removed - use api.functions directly
