/**
 * Application-wide constants
 *
 * Centralizes magic numbers and configuration values used across the application.
 * Import from here instead of using inline literals.
 */

// ===========================
// Pagination & Limits
// ===========================

/** Default number of items to fetch in paginated lists */
export const DEFAULT_PAGE_LIMIT = 50

/** Maximum items for larger data sets (job listings, etc.) */
export const LARGE_PAGE_LIMIT = 100

/**
 * Backend-enforced max for /queue pagination.
 * The API rejects anything above 100, so clamp client requests to stay in-range.
 */
export const QUEUE_MAX_PAGE_LIMIT = 100

/** Maximum event log entries to keep in memory */
export const EVENT_LOG_MAX_SIZE = 200

// ===========================
// Cache Configuration
// ===========================

/** Cache time-to-live in milliseconds (5 minutes) */
export const CACHE_TTL_MS = 5 * 60 * 1000

// ===========================
// Timing & Delays
// ===========================

/** Default API request timeout in milliseconds */
export const API_TIMEOUT_MS = 30000

/** Default retry delay in milliseconds */
export const API_RETRY_DELAY_MS = 1000

/** Auth client retry delay in milliseconds */
export const AUTH_RETRY_DELAY_MS = 500

/** Toast/notification duration in milliseconds */
export const TOAST_DURATION_MS = 5000

/** Success message auto-dismiss duration in milliseconds */
export const SUCCESS_MESSAGE_DURATION_MS = 3000

/** Health check refresh interval in milliseconds */
export const HEALTH_REFRESH_INTERVAL_MS = 30000

/** SSE reconnect delay in milliseconds */
export const SSE_RECONNECT_DELAY_MS = 5000

/** SSE graceful reconnect delay in milliseconds */
export const SSE_GRACEFUL_RECONNECT_DELAY_MS = 1000

// ===========================
// UI Configuration
// ===========================

/** Maximum score value (0-100 scale) */
export const MAX_SCORE = 100

/** Minimum score value */
export const MIN_SCORE = 0

// ===========================
// Logging Configuration
// ===========================

/** Logger debounce delay in milliseconds */
export const LOGGER_DEBOUNCE_MS = 5000
