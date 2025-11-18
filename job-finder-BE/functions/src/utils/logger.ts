/**
 * Unified Logger
 *
 * Automatically selects the appropriate logger based on environment:
 * - Local development (Firebase emulator): Uses local-logger (file-based to /logs/backend.log)
 * - Staging/Production (cloud): Uses cloud-logger (Google Cloud Logging SDK)
 *
 * MIGRATION NOTE: This file now intelligently routes to the correct logger implementation.
 * The SimpleLogger interface is maintained for backward compatibility.
 *
 * For new code, prefer using the structured logging interface:
 * ```typescript
 * import { logger } from './utils/logger'
 *
 * logger.info({
 *   category: 'api',
 *   action: 'request',
 *   message: 'Processing request',
 *   requestId: 'req-123',
 *   details: { jobId: 'job-456' }
 * })
 * ```
 */

import type { SimpleLogger } from '../types/logger.types';
import { createLocalLogger, createLegacyLocalLogger, type LocalLogger } from './local-logger';
import { createCloudLogger, createLegacyLogger, type CloudLogger } from './cloud-logger';

export type Logger = SimpleLogger;

/**
 * Check if running in local development environment
 */
export function isLocalDevelopment(): boolean {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.FIRESTORE_EMULATOR_HOST !== undefined ||
    process.env.FUNCTIONS_EMULATOR === 'true' ||
    process.env.FIREBASE_CONFIG === undefined // No Firebase config = emulator
  );
}

/**
 * List of field names that contain sensitive data
 * These will be automatically redacted from logs
 */
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'apikey',
  'api_key',
  'secret',
  'authorization',
  'auth',
  'bearer',
  'cookie',
  'session',
  // PII fields
  'email',
  'phone',
  'phonenumber',
  'phone_number',
  'ssn',
  'creditcard',
  'credit_card',
  'cvv',
  // Firebase-specific sensitive fields
  'idtoken',
  'id_token',
  'refreshtoken',
  'refresh_token',
];

/**
 * Redacts sensitive data from objects for safe logging
 *
 * @param data - Data to redact (can be object, array, primitive)
 * @returns Redacted copy of the data
 */
export const redactSensitiveData = (data: unknown): unknown => {
  // Handle primitives
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map((item) => redactSensitiveData(item));
  }

  // Handle objects
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase().replace(/[_-]/g, '');

    // Check if field name contains sensitive keywords
    const isSensitive = SENSITIVE_FIELDS.some((field) => keyLower.includes(field));

    if (isSensitive) {
      // Redact but show data type and length for debugging
      if (typeof value === 'string') {
        redacted[key] = `[REDACTED_STRING:${value.length}]`;
      } else if (typeof value === 'number') {
        redacted[key] = '[REDACTED_NUMBER]';
      } else {
        redacted[key] = '[REDACTED]';
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively redact nested objects
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
};

/**
 * Create a logger instance
 *
 * Automatically selects local-logger (file-based) or cloud-logger (Cloud Logging SDK)
 * based on environment detection.
 *
 * @returns Logger instance with info, warning, error methods
 */
export const createLogger = (): Logger => {
  // For backward compatibility, return SimpleLogger interface
  if (isLocalDevelopment()) {
    return createLegacyLocalLogger();
  } else {
    return createLegacyLogger();
  }
};

/**
 * Create a default logger instance (for services)
 *
 * This is an alias for createLogger() - uses environment detection.
 *
 * @returns SimpleLogger instance
 */
export const createDefaultLogger = (): SimpleLogger => {
  if (isLocalDevelopment()) {
    return createLegacyLocalLogger();
  } else {
    return createLegacyLogger();
  }
};

/**
 * Default logger instance
 * Use this in most cases - includes automatic PII redaction and structured logging
 * Automatically routes to local file or cloud logging based on environment
 */
export const logger = createLogger();

/**
 * Unified logger type that encompasses both logger types
 */
type UnifiedLogger = LocalLogger | CloudLogger;

/**
 * Create structured logger instance based on environment
 * Use this for full structured logging capabilities
 */
export function createStructuredLogger(): UnifiedLogger {
  if (isLocalDevelopment()) {
    return createLocalLogger();
  } else {
    return createCloudLogger();
  }
}

/**
 * Export logger types and utilities
 */
export { createLocalLogger, createCloudLogger, type LocalLogger, type CloudLogger };
