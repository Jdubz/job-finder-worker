/**
 * Shared Logging Types
 *
 * Used by frontend (TypeScript) and worker (Python) for structured logging
 *
 * IMPORTANT: When modifying these types, also update:
 * - Python type hints in job-finder/src/job_finder/logging_config.py (StructuredLogger)
 * - Frontend logger in job-finder-FE/src/services/logging/FrontendLogger.ts
 */

/**
 * Log category - used to filter logs by operation type
 *
 * TypeScript: LogCategory type
 * Python: str with validation in StructuredLogger
 */
export type LogCategory =
  | "worker"      // Worker lifecycle (started, idle, processing, stopped)
  | "queue"       // Queue item processing
  | "pipeline"    // Pipeline stage transitions
  | "scrape"      // Web scraping operations
  | "ai"          // AI model operations
  | "database"    // Database operations
  | "api"         // API requests/responses (backend)
  | "auth"        // Authentication operations
  | "client"      // Client-side operations (frontend)
  | "system"      // System-level operations

/**
 * Log level - severity of the log entry
 *
 * TypeScript: LogLevel type
 * Python: str with validation (matches Python logging levels)
 */
export type LogLevel =
  | "debug"       // Detailed diagnostic information
  | "info"        // General informational messages
  | "warning"     // Warning messages
  | "error"       // Error messages

/**
 * Pipeline stages for granular job processing
 *
 * TypeScript: PipelineStage type
 * Python: str with validation (matches JobSubTask and CompanySubTask)
 */
export type PipelineStage =
  // Job pipeline stages
  | "scrape"      // Extract job data from URL
  | "filter"      // Apply strike-based filtering
  | "analyze"     // AI matching and resume intake
  | "save"        // Save to job-matches
  // Company pipeline stages
  | "fetch"       // Fetch company website HTML
  | "extract"     // Extract company info with AI
  // Note: Company ANALYZE and SAVE stages reuse "analyze" and "save"

/**
 * Common log actions
 *
 * TypeScript: LogAction type
 * Python: str (flexible, but these are common patterns)
 */
export type LogAction =
  | "started"
  | "processing"
  | "completed"
  | "failed"
  | "skipped"
  | "idle"
  | "stopped"

/**
 * Structured log entry details
 *
 * This is the JSON structure for log entries written to file.
 * All fields are optional except category, action, and message.
 *
 * TypeScript: StructuredLogEntry interface
 * Python: Dict[str, Any] passed to logger.info(..., extra={"structured_fields": {...}})
 */
export interface StructuredLogEntry {
  // Required fields (always present)
  category: LogCategory
  action: LogAction | string  // Common actions or custom string
  message: string             // Human-readable message

  // Correlation and tracing
  requestId?: string          // Request correlation ID (for tracing across services)
  sessionId?: string          // Session ID (for frontend logs)

  // Context fields (optional - link to queue items and pipeline)
  queueItemId?: string        // Associated queue item ID (for filtering logs by job)
  queueItemType?: "job" | "company" | "scrape" | "source_discovery"
  pipelineStage?: PipelineStage

  // HTTP request context (for API logs)
  http?: {
    method?: string           // GET, POST, PUT, DELETE, etc.
    url?: string              // Request URL
    path?: string             // /api/queue/submit
    statusCode?: number       // 200, 404, 500, etc.
    userAgent?: string        // User agent string
    remoteIp?: string         // Client IP address (alias for ip)
    ip?: string               // Client IP address
    duration?: number         // Request duration in milliseconds
  }

  // Metadata (optional - additional structured data)
  details?: {
    // Flexible key-value pairs for additional context
    // Examples:
    // - { url: "https://...", duration: 1250 }
    // - { method: "greenhouse", jobs_found: 10 }
    // - { poll_interval: 60, items_count: 3 }
    [key: string]: string | number | boolean | null | undefined
  }

  // Error tracking (optional - only for error-level logs)
  error?: {
    type: string      // Exception class name (e.g., "ValueError")
    message: string   // Error message
    stack?: string    // Stack trace
  }
}

/**
 * Log metadata labels
 *
 * These are metadata fields that can be included with log entries.
 *
 * TypeScript: LogMetadata interface
 * Python: Dict[str, str] included in log entry
 */
export interface LogMetadata extends Record<string, string> {
  environment: "production" | "staging" | "development"
  service: string      // e.g., "worker", "frontend", "backend"
  version: string      // e.g., "1.0.0"
}

/**
 * Complete log entry structure as stored in files
 *
 * This represents the full log entry as written to log files,
 * including severity, timestamp, and structured payload.
 *
 * TypeScript: FileLogEntry interface
 * Python: Dict written as JSON to log file
 */
export interface FileLogEntry extends StructuredLogEntry {
  // Standard fields
  severity: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL"
  timestamp: string | Date  // ISO 8601 timestamp

  // Metadata
  environment: string
  service: string
  version?: string

  // Additional metadata (optional)
  metadata?: Record<string, unknown>
}

/**
 * Log query options for job-finder-FE UI
 *
 * TypeScript: LogQueryOptions interface
 * Python: Not used (job-finder-FE-only)
 *
 * Used in job-finder-FE hooks/components to fetch logs from files.
 *
 * Example usage:
 * ```typescript
 * const { logs } = useWorkerLogs({
 *   environment: 'production',
 *   queueItemId: 'abc123',
 *   category: 'pipeline',
 *   limit: 100
 * })
 * ```
 */
export interface LogQueryOptions {
  // Filter by environment
  environment?: "production" | "development"

  // Filter by queue item (get all logs for a specific job)
  queueItemId?: string

  // Filter by category (e.g., only worker status logs)
  category?: LogCategory

  // Filter by severity level
  level?: LogLevel
  minLevel?: LogLevel  // Get this level and above (e.g., minLevel="warning" gets warning + error)

  // Filter by time range
  startTime?: Date | string  // ISO 8601
  endTime?: Date | string    // ISO 8601

  // Pagination
  limit?: number       // Max entries to return (default: 100)
  pageToken?: string   // For pagination (returned by previous query)

  // Sorting
  orderBy?: "timestamp asc" | "timestamp desc"  // Default: "timestamp desc"
}

/**
 * Log query result from backend API
 *
 * TypeScript: LogQueryResult interface
 * Python: Not used (job-finder-FE-only)
 *
 * Returned by job-finder-FE server actions that query log files.
 */
export interface LogQueryResult {
  logs: FileLogEntry[]
  nextPageToken?: string  // For pagination
  totalCount?: number     // Total matching entries (if available)
}

/**
 * Helper type for log filtering
 *
 * TypeScript: BuildFilterParams type
 * Python: Not used (job-finder-FE-only)
 *
 * Used in job-finder-FE to build log query filters.
 */
export type BuildFilterParams = {
  logName?: string
  environment?: string
  category?: LogCategory
  queueItemId?: string
  severity?: string
  startTime?: string
  endTime?: string
}

/**
 * Dev Monitor log source identifiers exposed in the UI
 */
export type LogSource =
  | "local-all"
  | "local-frontend"
  | "local-backend"
  | "local-worker"
  | "local-dev-monitor"
  | "production-all"

/**
 * Local services with log streaming support
 */
export type LocalService =
  | "firebase-emulators"
  | "frontend-dev"
  | "job-finder-worker"
  | "dev-monitor-backend"
  | "all"

/**
 * Dev Monitor log levels
 */
export type DevMonitorLogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG"

/**
 * Dev Monitor log line structure shared between backend and frontend
 */
export interface DevMonitorLogLine {
  id: string
  service: LocalService
  timestamp: number
  level: DevMonitorLogLevel
  message: string
  raw: string
}

/**
 * Historical log payload returned for a service
 */
export interface LogHistory {
  serviceName: LocalService | "all"
  logs: DevMonitorLogLine[]
}
