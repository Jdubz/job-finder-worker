/**
 * Request ID Generator
 *
 * Generates unique request IDs for tracking requests across logs and transactions.
 * Format: req_{timestamp}_{random}
 */

/**
 * Generate a unique request ID for tracking
 *
 * @returns A unique request ID in format: req_1234567890_abcdef123
 *
 * @example
 * const requestId = generateRequestId()
 * // => "req_1697123456789_k3x9f2h5m"
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}
