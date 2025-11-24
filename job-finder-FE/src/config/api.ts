/**
 * API Configuration for the Node/SQLite backend
 *
 * Centralizes the URLs shared by the frontend API clients. The runtime stack lives
 * behind a Cloudflared tunnel (Watchtower-managed) so every environment simply points
 * to the appropriate HTTPS base via `VITE_API_BASE_URL`.
 *
 * In development mode, dynamically uses the current hostname so cross-device
 * testing works without restarting the dev server.
 */

function getApiBaseUrl(): string {
  // If explicitly set, use that
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "")
  }

  // In development, dynamically use current hostname for cross-device support
  if (import.meta.env.DEV && typeof window !== "undefined") {
    const hostname = window.location.hostname
    const port = import.meta.env.VITE_API_PORT || "8080"
    return `http://${hostname}:${port}`
  }

  // Fallback for SSR or when window not available
  return "http://localhost:8080"
}

/**
 * API Configuration - uses getters for dynamic URL resolution in development
 */
export const API_CONFIG = {
  get baseUrl() {
    return `${getApiBaseUrl()}/api`
  },
  get generatorBaseUrl() {
    return `${getApiBaseUrl()}/api/generator`
  },
  timeout: 30000,
  retryAttempts: 3,
  retryDelay: 1000,
}

/**
 * Firebase Cloud Functions endpoints
 * Note: Staging functions use -staging suffix, production has no suffix
 */
export const api = {
  get baseUrl() {
    return `${getApiBaseUrl()}/api`
  },
  get generatorBaseUrl() {
    return `${getApiBaseUrl()}/api/generator`
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

// Legacy functions endpoints removed – use the Express API exclusively.
