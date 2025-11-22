/**
 * Shared Logging Types
 *
 * Used by both portfolio (TypeScript) and job-finder (Python) for Cloud Logging integration
 *
 * IMPORTANT: When modifying these types, also update:
 * - Python type hints in job-finder/src/job_finder/logging_config.py (StructuredLogger)
 * - Cloud Logging query filters in portfolio project
 * - Documentation in job-finder/docs/CLOUD_LOGGING_DESIGN.md
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
  | "database"    // Firestore operations
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
 * This is the jsonPayload structure in Cloud Logging.
 * All fields are optional except category, action, and message.
 *
 * TypeScript: StructuredLogEntry interface
 * Python: Dict[str, Any] passed to logger.info(..., extra={"json_fields": {...}})
 *
 * Example Cloud Logging query:
 * ```
 * jsonPayload.category="pipeline"
 * jsonPayload.queueItemId="abc123"
 * jsonPayload.pipelineStage="scrape"
 * ```
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
 * Cloud Logging labels
 *
 * These are set at the handler level and applied to all log entries.
 *
 * TypeScript: CloudLoggingLabels interface
 * Python: Dict[str, str] passed to CloudLoggingHandler(labels=...)
 *
 * Example Cloud Logging query:
 * ```
 * labels.environment="production"
 * labels.service="job-finder"
 * ```
 */
export interface CloudLoggingLabels extends Record<string, string> {
  environment: "production" | "development"
  service: string      // e.g., "job-finder"
  version: string      // e.g., "1.0.0"
}

/**
 * Complete Cloud Logging entry structure
 *
 * This represents the full log entry in Cloud Logging, including
 * standard fields (severity, timestamp) and custom fields (jsonPayload, labels).
 *
 * TypeScript: CloudLogEntry interface
 * Python: Not used directly (Cloud Logging client handles this)
 *
 * This is what job-finder-FE UI receives when querying Cloud Logging API.
 */
export interface CloudLogEntry {
  // Standard Cloud Logging fields
  severity: "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL"
  timestamp: string | Date  // ISO 8601 timestamp
  logName: string          // e.g., "projects/static-sites-257923/logs/job-finder"

  // Custom labels (set by CloudLoggingHandler)
  labels: CloudLoggingLabels

  // Structured payload (our custom fields)
  jsonPayload: StructuredLogEntry

  // Additional metadata (optional)
  resource?: {
    type: string  // e.g., "generic_task"
    labels: Record<string, string>
  }

  // Trace context (optional)
  trace?: string
  spanId?: string
}

/**
 * Log query options for job-finder-FE UI
 *
 * TypeScript: LogQueryOptions interface
 * Python: Not used (job-finder-FE-only)
 *
 * Used in job-finder-FE hooks/components to fetch logs from Cloud Logging.
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
 * Log query result from job-finder-FE server action / Cloud Function
 *
 * TypeScript: LogQueryResult interface
 * Python: Not used (job-finder-FE-only)
 *
 * Returned by job-finder-FE server actions that query Cloud Logging.
 */
export interface LogQueryResult {
  logs: CloudLogEntry[]
  nextPageToken?: string  // For pagination
  totalCount?: number     // Total matching entries (if available)
}

/**
 * Helper type for log filtering
 *
 * TypeScript: BuildFilterParams type
 * Python: Not used (job-finder-FE-only)
 *
 * Used in job-finder-FE to build Cloud Logging query filters.
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
