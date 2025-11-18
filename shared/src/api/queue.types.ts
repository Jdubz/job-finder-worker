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
 * These types provide extended API functionality using ApiResponse wrappers.
 */

import type { ApiResponse, PaginationParams } from "../api.types"
import type { QueueItem, QueueStatus, QueueItemType, QueueSource, QueueStats } from "../queue.types"

/**
 * Submit Job with Priority Request
 * Extended request payload for submitting a new job with priority
 */
export interface SubmitJobWithPriorityRequest {
  url: string
  companyName: string
  source?: QueueSource
  metadata?: Record<string, unknown>
  priority?: "high" | "normal" | "low"
}

/**
 * Submit Job with Priority Response
 * Extended response payload for job submission with position info
 */
export interface SubmitJobWithPriorityResponse {
  queueItem: QueueItem
  position?: number // Position in queue
  estimatedProcessingTime?: number // Estimated time in seconds
  message?: string
}

/**
 * Submit Bulk Jobs Request
 * Request payload for submitting multiple jobs at once
 */
export interface SubmitBulkJobsRequest {
  jobs: Array<{
    url: string
    companyName: string
    source?: QueueSource
    metadata?: Record<string, unknown>
  }>
}

/**
 * Submit Bulk Jobs Response
 * Response payload for successful bulk job submission
 */
export interface SubmitBulkJobsResponse {
  queueItems: QueueItem[]
  successCount: number
  failedCount: number
  failedUrls?: string[]
  message?: string
}

/**
 * Update Job Status Request
 * Request payload for updating a queue item status
 */
export interface UpdateJobStatusRequest {
  queueItemId: string
  status: QueueStatus
  resultMessage?: string
  errorDetails?: string
  metadata?: Record<string, unknown>
}

/**
 * Update Job Status Response
 * Response payload for successful status update
 */
export interface UpdateJobStatusResponse {
  queueItem: QueueItem
  message?: string
}

/**
 * Retry Job Request
 * Request payload for retrying a failed job
 */
export interface RetryJobRequest {
  queueItemId: string
  resetRetryCount?: boolean
}

/**
 * Retry Job Response
 * Response payload for successful job retry
 */
export interface RetryJobResponse {
  queueItem: QueueItem
  position?: number
  message?: string
}

/**
 * Cancel Job Request
 * Request payload for canceling a pending/processing job
 */
export interface CancelJobRequest {
  queueItemId: string
  reason?: string
}

/**
 * Cancel Job Response
 * Response payload for successful job cancellation
 */
export interface CancelJobResponse {
  queueItem: QueueItem
  message?: string
}

/**
 * Get Queue Item Request
 * Request payload for fetching a single queue item
 */
export interface GetQueueItemRequest {
  queueItemId: string
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
 * Get Queue Statistics Request
 * Request payload for fetching queue statistics
 */
export interface GetQueueStatsRequest {
  startDate?: string
  endDate?: string
  groupBy?: "status" | "type" | "source"
}

/**
 * Get Queue Statistics Response
 * Response payload for successful queue stats fetch
 */
export interface GetQueueStatsResponse {
  stats: QueueStats
  breakdown?: Record<string, QueueStats>
  timeRange?: {
    start: string
    end: string
  }
}

/**
 * Clear Failed Jobs Request
 * Request payload for clearing failed jobs from queue
 */
export interface ClearFailedJobsRequest {
  olderThan?: string // ISO date string
  limit?: number
}

/**
 * Clear Failed Jobs Response
 * Response payload for successful failed jobs cleanup
 */
export interface ClearFailedJobsResponse {
  clearedCount: number
  message?: string
}

/**
 * Pause Queue Request
 * Request payload for pausing queue processing
 */
export interface PauseQueueRequest {
  reason?: string
  duration?: number // Duration in seconds
}

/**
 * Pause Queue Response
 * Response payload for successful queue pause
 */
export interface PauseQueueResponse {
  paused: boolean
  resumesAt?: string
  message?: string
}

/**
 * Resume Queue Request
 * Request payload for resuming queue processing
 */
export interface ResumeQueueRequest {
  // Empty - no parameters needed
}

/**
 * Resume Queue Response
 * Response payload for successful queue resume
 */
export interface ResumeQueueResponse {
  paused: boolean
  message?: string
}

/**
 * Type-safe API signatures for queue endpoints
 */
export type SubmitJobWithPriorityApi = (
  request: SubmitJobWithPriorityRequest
) => Promise<ApiResponse<SubmitJobWithPriorityResponse>>

export type SubmitBulkJobsApi = (
  request: SubmitBulkJobsRequest
) => Promise<ApiResponse<SubmitBulkJobsResponse>>

export type UpdateJobStatusApi = (
  request: UpdateJobStatusRequest
) => Promise<ApiResponse<UpdateJobStatusResponse>>

export type RetryJobApi = (
  request: RetryJobRequest
) => Promise<ApiResponse<RetryJobResponse>>

export type CancelJobApi = (
  request: CancelJobRequest
) => Promise<ApiResponse<CancelJobResponse>>

export type GetQueueItemApi = (
  request: GetQueueItemRequest
) => Promise<ApiResponse<GetQueueItemResponse>>

export type ListQueueItemsApi = (
  request: ListQueueItemsRequest
) => Promise<ApiResponse<ListQueueItemsResponse>>

export type GetQueueStatsApi = (
  request: GetQueueStatsRequest
) => Promise<ApiResponse<GetQueueStatsResponse>>

export type ClearFailedJobsApi = (
  request: ClearFailedJobsRequest
) => Promise<ApiResponse<ClearFailedJobsResponse>>

export type PauseQueueApi = (
  request: PauseQueueRequest
) => Promise<ApiResponse<PauseQueueResponse>>

export type ResumeQueueApi = (
  request: ResumeQueueRequest
) => Promise<ApiResponse<ResumeQueueResponse>>
