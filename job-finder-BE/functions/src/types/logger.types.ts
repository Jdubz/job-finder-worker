/**
 * Shared Logger Type Definitions
 *
 * Centralized logger interface used across all services and middleware.
 * This ensures consistent logging patterns and enables easy testing.
 */

export type SimpleLogger = {
  info: (message: string, data?: unknown) => void
  warning: (message: string, data?: unknown) => void
  error: (message: string, data?: unknown) => void
}

// Alias for backward compatibility
export type Logger = SimpleLogger
