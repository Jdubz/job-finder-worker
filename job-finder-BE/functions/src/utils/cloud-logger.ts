/**
 * Google Cloud Logging Integration
 *
 * Provides structured JSON logging using Google Cloud Logging SDK.
 * All logs conform to the StructuredLogEntry schema from @shared/types.
 *
 * Usage:
 * ```typescript
 * import { createCloudLogger } from './utils/cloud-logger'
 *
 * const logger = createCloudLogger()
 * logger.info({
 *   category: 'api',
 *   action: 'completed',
 *   message: 'User submitted job',
 *   requestId: 'req-123',
 *   userId: 'user-456',
 *   details: { url: 'https://example.com/job' }
 * })
 * ```
 */

import { Logging } from '@google-cloud/logging'
import type { StructuredLogEntry, CloudLoggingLabels, LogLevel } from '@shared/types'

// PII redaction patterns (from original logger.ts)
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'apiKey',
  'api_key',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'privateKey',
  'private_key',
  'firebaseToken',
  'firebase_token',
]

const SENSITIVE_PATTERNS = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  phone: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  creditCard: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
}

/**
 * Check if code is running in test environment
 */
const isTestEnvironment = (): boolean => {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.JEST_WORKER_ID !== undefined
  )
}

/**
 * Check if running in local development (not test, but emulator)
 */
const isLocalDevelopment = (): boolean => {
  return (
    process.env.NODE_ENV === 'development' ||
    process.env.FIRESTORE_EMULATOR_HOST !== undefined ||
    process.env.FUNCTIONS_EMULATOR === 'true' ||
    process.env.FIREBASE_CONFIG === undefined
  )
}

/**
 * Redact PII from log data
 */
function redactSensitiveData(data: unknown): unknown {
  if (typeof data === 'string') {
    let redacted = data
    Object.entries(SENSITIVE_PATTERNS).forEach(([key, pattern]) => {
      redacted = redacted.replace(pattern, `[REDACTED_${key.toUpperCase()}]`)
    })
    return redacted
  }

  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item))
  }

  if (data && typeof data === 'object') {
    const redacted: Record<string, unknown> = {}
    Object.entries(data).forEach(([key, value]) => {
      if (SENSITIVE_FIELDS.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        redacted[key] = `[REDACTED_STRING:${String(value).length}]`
      } else {
        redacted[key] = redactSensitiveData(value)
      }
    })
    return redacted
  }

  return data
}

/**
 * Map LogLevel to Cloud Logging severity
 */
function getSeverity(level: LogLevel): 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR' {
  const severityMap: Record<LogLevel, 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'> = {
    debug: 'DEBUG',
    info: 'INFO',
    warning: 'WARNING',
    error: 'ERROR',
  }
  return severityMap[level]
}

/**
 * Get environment from environment variables
 */
function getEnvironment(): 'staging' | 'production' | 'development' {
  const env = process.env.ENVIRONMENT || process.env.NODE_ENV || 'development'
  if (env === 'production') return 'production'
  if (env === 'staging') return 'staging'
  return 'development'
}

/**
 * Cloud Logger interface
 */
export interface CloudLogger {
  debug(entry: Omit<StructuredLogEntry, 'category'> & { category?: StructuredLogEntry['category'] }): void
  info(entry: Omit<StructuredLogEntry, 'category'> & { category?: StructuredLogEntry['category'] }): void
  warning(entry: Omit<StructuredLogEntry, 'category'> & { category?: StructuredLogEntry['category'] }): void
  error(entry: Omit<StructuredLogEntry, 'category'> & { category?: StructuredLogEntry['category'] }): void
}

/**
 * Create a Cloud Logger instance
 *
 * @param logName - Name of the log (default: 'job-finder-be')
 * @param labels - Additional labels to apply to all logs
 * @returns CloudLogger instance
 */
export function createCloudLogger(
  logName = 'job-finder-be',
  additionalLabels: Partial<CloudLoggingLabels> = {}
): CloudLogger {
  // In test environment, use console-based logging
  if (isTestEnvironment()) {
    return createConsoleLogger()
  }

  // In local development, warn and use console logger
  // (Actual file logging is handled by local-logger.ts)
  if (isLocalDevelopment()) {
    console.warn('[CloudLogger] Local development detected. Consider using local-logger.ts for file-based logging.')
    return createConsoleLogger()
  }

  // Initialize Google Cloud Logging (staging/production only)
  const logging = new Logging()
  const log = logging.log(logName)

  // Default labels
  const labels: CloudLoggingLabels = {
    environment: getEnvironment(),
    service: 'job-finder-be',
    version: process.env.npm_package_version || '1.0.0',
    ...additionalLabels,
  }

  /**
   * Convert labels to Record<string, string>, filtering out undefined values
   */
  function toStringRecord(labels: CloudLoggingLabels): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(labels)) {
      if (value !== undefined) {
        result[key] = String(value)
      }
    }
    return result
  }

  /**
   * Write a structured log entry to Cloud Logging
   */
  function writeLog(level: LogLevel, entry: Omit<StructuredLogEntry, 'category'> & { category?: StructuredLogEntry['category'] }): void {
    // Default category to 'system' if not provided
    const fullEntry: StructuredLogEntry = {
      ...entry,
      category: entry.category || 'system',
    }

    // Redact PII from details and error fields
    if (fullEntry.details) {
      const redacted = redactSensitiveData(fullEntry.details)
      fullEntry.details = redacted as Record<string, string | number | boolean | null | undefined>
    }
    if (fullEntry.error) {
      fullEntry.error = {
        ...fullEntry.error,
        message: redactSensitiveData(fullEntry.error.message) as string,
      }
    }

    // Create Cloud Logging entry
    const metadata: {
      severity: string
      labels: Record<string, string>
      resource: {
        type: string
        labels: Record<string, string>
      }
    } = {
      severity: getSeverity(level),
      labels: toStringRecord(labels),
      resource: {
        type: 'cloud_function',
        labels: {
          function_name: process.env.FUNCTION_NAME || 'unknown',
          project_id: process.env.GCP_PROJECT || process.env.GCLOUD_PROJECT || 'unknown',
          region: process.env.FUNCTION_REGION || 'unknown',
        },
      },
    }

    const logEntry = log.entry(metadata, fullEntry)

    // Write to Cloud Logging (async, fire-and-forget)
    log.write(logEntry).catch((err) => {
      // Fallback to console if Cloud Logging fails
      console.error('Failed to write to Cloud Logging:', err)
      console.log(JSON.stringify({ level, ...fullEntry }))
    })
  }

  return {
    debug: (entry) => writeLog('debug', entry),
    info: (entry) => writeLog('info', entry),
    warning: (entry) => writeLog('warning', entry),
    error: (entry) => writeLog('error', entry),
  }
}

/**
 * Create a console-based logger (for testing)
 */
function createConsoleLogger(): CloudLogger {
  function writeConsoleLog(level: LogLevel, entry: Omit<StructuredLogEntry, 'category'> & { category?: StructuredLogEntry['category'] }): void {
    const fullEntry: StructuredLogEntry = {
      ...entry,
      category: entry.category || 'system',
    }

    // Redact PII
    if (fullEntry.details) {
      const redacted = redactSensitiveData(fullEntry.details)
      fullEntry.details = redacted as Record<string, string | number | boolean | null | undefined>
    }

    const logLine = JSON.stringify({
      severity: getSeverity(level),
      timestamp: new Date().toISOString(),
      ...fullEntry,
    })

    switch (level) {
      case 'debug':
        console.debug(logLine)
        break
      case 'info':
        console.log(logLine)
        break
      case 'warning':
        console.warn(logLine)
        break
      case 'error':
        console.error(logLine)
        break
    }
  }

  return {
    debug: (entry) => writeConsoleLog('debug', entry),
    info: (entry) => writeConsoleLog('info', entry),
    warning: (entry) => writeConsoleLog('warning', entry),
    error: (entry) => writeConsoleLog('error', entry),
  }
}

/**
 * Create a default logger instance (singleton)
 */
let defaultLogger: CloudLogger | null = null

export function getDefaultLogger(): CloudLogger {
  if (!defaultLogger) {
    defaultLogger = createCloudLogger()
  }
  return defaultLogger
}

/**
 * Legacy compatibility: Simple logger interface
 * This maintains backward compatibility with existing code.
 */
export type SimpleLogger = {
  info: (message: string, data?: unknown) => void
  warning: (message: string, data?: unknown) => void
  error: (message: string, data?: unknown) => void
}

/**
 * Create a legacy-compatible simple logger
 *
 * This wraps the Cloud Logger to provide the old SimpleLogger interface.
 * Use this for gradual migration from the old logger.
 */
export function createLegacyLogger(): SimpleLogger {
  const cloudLogger = getDefaultLogger()

  return {
    info: (message: string, data?: unknown) => {
      cloudLogger.info({
        category: 'system',
        action: 'log',
        message,
        details: data ? (data as Record<string, string | number | boolean | null | undefined>) : undefined,
      })
    },
    warning: (message: string, data?: unknown) => {
      cloudLogger.warning({
        category: 'system',
        action: 'log',
        message,
        details: data ? (data as Record<string, string | number | boolean | null | undefined>) : undefined,
      })
    },
    error: (message: string, data?: unknown) => {
      cloudLogger.error({
        category: 'system',
        action: 'error',
        message,
        details: data ? (data as Record<string, string | number | boolean | null | undefined>) : undefined,
      })
    },
  }
}
