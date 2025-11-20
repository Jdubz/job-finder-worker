/**
 * API Configuration for the Node/SQLite backend
 *
 * Centralizes the URLs shared by the frontend API clients. The runtime stack lives
 * behind a Cloudflared tunnel (Watchtower-managed) so every environment simply points
 * to the appropriate HTTPS base via `VITE_API_BASE_URL`.
 */

const rawApiBase =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.VITE_USE_EMULATORS === "true" ? "http://localhost:8080" : "http://localhost:8080")
const normalizedApiBase = rawApiBase.replace(/\/$/, "")
const restBaseUrl = `${normalizedApiBase}/api`
const generatorBaseUrl = `${restBaseUrl}/generator`

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

// Legacy functions endpoints removed – use the Express API exclusively.
