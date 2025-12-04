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
