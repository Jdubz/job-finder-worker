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

import { API_TIMEOUT_MS, API_RETRY_DELAY_MS } from "./constants"

export function resolveApiBaseUrl(): string {
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
    return `${resolveApiBaseUrl()}/api`
  },
  get generatorBaseUrl() {
    return `${resolveApiBaseUrl()}/api/generator`
  },
  timeout: API_TIMEOUT_MS,
  retryAttempts: 3,
  retryDelay: API_RETRY_DELAY_MS,
}

// Legacy authenticatedFetch removed – use cookie-based auth via credentials: include

/**
 * Convert a relative artifact URL to an absolute URL
 * Backend returns paths like /api/generator/artifacts/... which need the API base prepended
 */
export function getAbsoluteArtifactUrl(relativeUrl: string | null | undefined): string | null {
  if (!relativeUrl) return null
  // Already absolute
  if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://")) {
    return relativeUrl
  }
  // Use resolveApiBaseUrl (without /api suffix) since artifact URLs already include /api
  return `${resolveApiBaseUrl()}${relativeUrl}`
}
