/**
 * Queue API Types
 *
 * Type definitions for queue management API endpoints.
 * Handles job submission, status updates, and queue operations.
 *
 * Used by job-finder-FE for queue management
 * and by job-finder-BE to implement the endpoints.
 *
 * Note: Basic SubmitJobRequest/Response types are in queue.types.ts
 */

import type { PaginationParams } from "../api.types"
import type { QueueItem, QueueStatus, QueueItemType, QueueSource, QueueStats } from "../queue.types"

/**
 * Update Job Status Response
 * Response payload for successful status update
 */
export interface UpdateJobStatusResponse {
  queueItem: QueueItem
  message?: string
}

/**
 * Get Queue Item Response
 * Response payload for successful queue item fetch
 */
export interface GetQueueItemResponse {
  queueItem: QueueItem
}

/**
 * List Queue Items Request
 * Request payload for listing queue items with filters
 */
export interface ListQueueItemsRequest extends PaginationParams {
  status?: QueueStatus | QueueStatus[]
  type?: QueueItemType
  source?: QueueSource
  companyName?: string
  startDate?: string
  endDate?: string
  sortBy?: "created_at" | "updated_at" | "processed_at"
  sortOrder?: "asc" | "desc"
}

/**
 * List Queue Items Response
 * Response payload for successful queue items list
 */
export interface ListQueueItemsResponse {
  items: QueueItem[]
  pagination: {
    limit: number
    offset: number
    total: number
    hasMore: boolean
  }
}

/**
 * Get Queue Statistics Response
 * Response payload for successful queue stats fetch
 */
export interface GetQueueStatsResponse {
  stats: QueueStats
}

// ============================================================================
// Worker Health Types
// ============================================================================

/**
 * Worker Health Response
 * Response payload from GET /api/queue/worker/health
 */
export interface WorkerHealthResponse {
  reachable: boolean
  workerUrl: string
  error?: string
  health?: {
    status: string
    running: boolean
    items_processed: number
    last_poll: string | null
    iteration: number
    last_error: string | null
  }
  status?: {
    worker: Record<string, unknown>
    queue: Record<string, unknown>
    uptime: number
  }
}

// ============================================================================
// CLI Health Types
// ============================================================================

/**
 * CLI Provider Names
 * Supported CLI providers for AI tasks
 */
export type CliProviderName = 'codex' | 'gemini'

/**
 * CLI Provider Health Status
 * Health status for a single CLI/API provider
 */
export interface CliProviderHealth {
  /** Whether the CLI/SDK is installed and available */
  available: boolean
  /** Whether the provider is authenticated (logged in or API key set) */
  authenticated: boolean
  /** Human-readable status message */
  message: string
}

/**
 * CLI Health Response
 * Response payload from GET /api/queue/cli/health
 */
export interface CliHealthResponse {
  /** Whether the worker was reachable */
  reachable: boolean
  /** Worker URL that was queried */
  workerUrl: string
  /** Error message if worker was not reachable */
  error?: string
  /** Health status for each provider (only present if reachable) */
  providers?: Record<CliProviderName, CliProviderHealth>
  /** Timestamp when health was checked (Unix seconds) */
  timestamp?: number
}

// ============================================================================
// Cron Status Types
// ============================================================================

/**
 * Cron Status Response
 * Response payload from GET /api/queue/cron/status
 */
export interface CronStatusResponse {
  enabled: boolean
  started: boolean
  nodeEnv: string
  expressions: {
    scrape: string
    maintenance: string
    logrotate: string
  }
  workerMaintenanceUrl: string
  logDir: string
}

/**
 * Cron Trigger Response
 * Response payload from POST /api/queue/cron/trigger/*
 */
export interface CronTriggerResponse {
  success: boolean
  queueItemId?: string
  status?: number
  error?: string
}
