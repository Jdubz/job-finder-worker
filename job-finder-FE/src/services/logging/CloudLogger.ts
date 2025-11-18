// @ts-nocheck
/**
 * Google Cloud Logging Service
 *
 * Provides structured logging to Google Cloud Logging using shared types.
 * Replaces console.log statements with proper structured logging.
 */

import type {
  StructuredLogEntry,
  CloudLoggingLabels,
  LogCategory,
  LogLevel,
  LogAction,
  PipelineStage,
  // CloudLogEntry
} from "@shared/types"

/**
 * Cloud Logger Configuration
 */
interface CloudLoggerConfig {
  projectId: string
  logName: string
  environment: "development" | "staging" | "production"
  service: string
  version: string
}

/**
 * Google Cloud Logging Service
 *
 * Handles structured logging to Google Cloud Logging with proper error handling,
 * batching, and fallback to console logging in development.
 */
export class CloudLogger {
  private config: CloudLoggerConfig
  private logBuffer: StructuredLogEntry[] = []
  private flushInterval: number = 5000 // 5 seconds
  private maxBufferSize: number = 100
  private flushTimer?: NodeJS.Timeout

  constructor(config: CloudLoggerConfig) {
    this.config = config
    this.startFlushTimer()
  }

  /**
   * Log a structured entry to Google Cloud Logging
   */
  async log(
    level: LogLevel,
    category: LogCategory,
    action: LogAction | string,
    message: string,
    options: {
      queueItemId?: string
      queueItemType?: "job" | "company" | "scrape" | "source_discovery"
      pipelineStage?: PipelineStage
      details?: Record<string, string | number | boolean | null | undefined>
      error?: {
        type: string
        message: string
        stack?: string
      }
    } = {}
  ): Promise<void> {
    const logEntry: StructuredLogEntry = {
      category,
      action,
      message,
      queueItemId: options.queueItemId,
      queueItemType: options.queueItemType,
      pipelineStage: options.pipelineStage,
      details: options.details,
      error: options.error,
    }

    // In development, also log to console for debugging
    if (this.config.environment === "development") {
      this.logToConsole(level, logEntry)
    }

    // Add to buffer for batching
    this.logBuffer.push(logEntry)

    // Flush immediately if buffer is full or if it's an error
    if (this.logBuffer.length >= this.maxBufferSize || level === "error") {
      await this.flush()
    }
  }

  /**
   * Convenience methods for different log levels
   */
  async debug(
    category: LogCategory,
    action: LogAction | string,
    message: string,
    options?: Parameters<CloudLogger["log"]>[4]
  ): Promise<void> {
    return this.log("debug", category, action, message, options)
  }

  async info(
    category: LogCategory,
    action: LogAction | string,
    message: string,
    options?: Parameters<CloudLogger["log"]>[4]
  ): Promise<void> {
    return this.log("info", category, action, message, options)
  }

  async warning(
    category: LogCategory,
    action: LogAction | string,
    message: string,
    options?: Parameters<CloudLogger["log"]>[4]
  ): Promise<void> {
    return this.log("warning", category, action, message, options)
  }

  async error(
    category: LogCategory,
    action: LogAction | string,
    message: string,
    options?: Parameters<CloudLogger["log"]>[4]
  ): Promise<void> {
    return this.log("error", category, action, message, options)
  }

  /**
   * Log API request/response
   */
  async logApiRequest(
    method: string,
    url: string,
    statusCode: number,
    duration: number,
    options?: {
      queueItemId?: string
      error?: Error
    }
  ): Promise<void> {
    const level: LogLevel = statusCode >= 400 ? "error" : "info"
    const action: LogAction = statusCode >= 400 ? "failed" : "completed"

    await this.log(
      level,
      "database",
      action,
      `API ${method} ${url} - ${statusCode} (${duration}ms)`,
      {
        queueItemId: options?.queueItemId,
        details: {
          method,
          url,
          statusCode,
          duration,
          ...(options?.error && {
            errorType: options.error.constructor.name,
            errorMessage: options.error.message,
          }),
        },
        error: options?.error
          ? {
              type: options.error.constructor.name,
              message: options.error.message,
              stack: options.error.stack,
            }
          : undefined,
      }
    )
  }

  /**
   * Log user actions
   */
  async logUserAction(
    action: string,
    details: Record<string, unknown>,
    options?: {
      queueItemId?: string
    }
  ): Promise<void> {
    await this.log("info", "database", action, `User action: ${action}`, {
      queueItemId: options?.queueItemId,
      details,
    })
  }

  /**
   * Log component lifecycle events
   */
  async logComponentLifecycle(
    componentName: string,
    action: "mounted" | "unmounted" | "updated" | "error",
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log(
      action === "error" ? "error" : "info",
      "database",
      action,
      `Component ${componentName} ${action}`,
      {
        details: {
          component: componentName,
          ...details,
        },
      }
    )
  }

  /**
   * Flush buffered logs to Google Cloud Logging
   */
  async flush(): Promise<void> {
    if (this.logBuffer.length === 0) return

    const logsToSend = [...this.logBuffer]
    this.logBuffer = []

    try {
      await this.sendToCloudLogging(logsToSend)
    } catch (error) {
      // Fallback to console if Cloud Logging fails
      console.error("Failed to send logs to Cloud Logging:", error)
      logsToSend.forEach((log) => this.logToConsole("info", log))
    }
  }

  /**
   * Send logs to Google Cloud Logging
   */
  private async sendToCloudLogging(logs: StructuredLogEntry[]): Promise<void> {
    const labels: CloudLoggingLabels = {
      environment: this.config.environment,
      service: this.config.service,
      version: this.config.version,
    }

    // In development, log to console and file
    if (this.config.environment === "development") {
      logs.forEach((log) => {
        const level = this.determineLogLevel(log)
        this.logToConsole(level, log)
        this.logToFile(level, log)
      })
      return
    }

    try {
      // Use Firebase Functions to send logs to Google Cloud Logging
      // This avoids needing to configure Google Cloud credentials in the frontend
      const response = await fetch("/api/logs", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          logs,
          labels,
          projectId: this.config.projectId,
          logName: this.config.logName,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to send logs: ${response.status} ${response.statusText}`)
      }
    } catch (error) {
      // Fallback to console if Cloud Logging fails
      console.error("Failed to send logs to Cloud Logging:", error)
      logs.forEach((log) => this.logToConsole("info", log))
    }
  }

  /**
   * Determine log level from log entry
   */
  private determineLogLevel(log: StructuredLogEntry): LogLevel {
    if (log.error) return "error"
    if (log.action === "failed") return "error"
    if (log.action === "completed") return "info"
    return "info"
  }

  /**
   * Get Cloud Logging severity level from log entry
   */
  private getSeverityLevel(
    log: StructuredLogEntry
  ): "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL" {
    if (log.error) return "ERROR"
    if (log.action === "failed") return "ERROR"
    if (log.action === "completed") return "INFO"
    return "INFO"
  }

  /**
   * Log to console for development debugging
   */
  private logToConsole(level: LogLevel, log: StructuredLogEntry): void {
    const timestamp = new Date().toISOString()
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${log.category}]`

    const consoleMethod =
      level === "error" ? console.error : level === "warning" ? console.warn : console.log

    consoleMethod(prefix, log.message, {
      action: log.action,
      ...(log.queueItemId && { queueItemId: log.queueItemId }),
      ...(log.pipelineStage && { pipelineStage: log.pipelineStage }),
      ...(log.details && { details: log.details }),
      ...(log.error && { error: log.error }),
    })
  }

  /**
   * Log to file for development debugging
   */
  private logToFile(level: LogLevel, log: StructuredLogEntry): void {
    try {
      const timestamp = new Date().toISOString()
      const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        category: log.category,
        action: log.action,
        message: log.message,
        ...(log.queueItemId && { queueItemId: log.queueItemId }),
        ...(log.pipelineStage && { pipelineStage: log.pipelineStage }),
        ...(log.details && { details: log.details }),
        ...(log.error && { error: log.error }),
      }

      // In browser environment, we can't directly write to files
      // Instead, we'll use a simple approach that works with the app-monitor
      // The app-monitor will collect console logs and write them to files
      console.log(`[FILE_LOG] ${JSON.stringify(logEntry)}`)
    } catch (error) {
      console.error("Failed to log to file:", error)
    }
  }

  /**
   * Start automatic flush timer
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush()
    }, this.flushInterval)
  }

  /**
   * Stop flush timer and flush remaining logs
   */
  async destroy(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = undefined
    }
    await this.flush()
  }
}

/**
 * Default logger instance
 */
export const logger = new CloudLogger({
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "static-sites-257923",
  logName: "job-finder-fe",
  environment: (import.meta.env.MODE as "development" | "staging" | "production") || "development",
  service: "job-finder-fe",
  version: import.meta.env.VITE_APP_VERSION || "1.0.0",
})

/**
 * Hook for using logger in React components
 */
export function useLogger() {
  return logger
}
