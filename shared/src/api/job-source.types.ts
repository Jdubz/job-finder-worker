/**
 * Job Source API Types
 *
 * Type definitions for job source management API endpoints.
 * Handles job source listing, filtering, and retrieval.
 */

import type { PaginationParams, PaginationMeta } from "../api.types"
import type { JobSource, JobSourceStatus } from "../job.types"

/**
 * List Job Sources Request
 * Query parameters for listing job sources with filters
 */
export interface ListJobSourcesRequest extends PaginationParams {
  /** Filter by status */
  status?: JobSourceStatus
  /** Filter by source type */
  sourceType?: string
  /** Filter by company ID */
  companyId?: string
  /** Search by name (partial match) */
  search?: string
  /** Sort field */
  sortBy?: "name" | "created_at" | "updated_at" | "last_scraped_at"
  /** Sort order */
  sortOrder?: "asc" | "desc"
}

/**
 * List Job Sources Response
 * Response payload for job source list endpoint
 */
export interface ListJobSourcesResponse {
  items: JobSource[]
  pagination: PaginationMeta
}

/**
 * Get Job Source Request
 * Path parameters for fetching a single job source
 */
export interface GetJobSourceRequest {
  sourceId: string
}

/**
 * Get Job Source Response
 * Response payload for single job source fetch
 */
export interface GetJobSourceResponse {
  source: JobSource
}

/**
 * Update Job Source Request
 * Request payload for updating job source data
 */
export interface UpdateJobSourceRequest {
  sourceId: string
  updates: Partial<Omit<JobSource, "id" | "createdAt" | "updatedAt">>
}

/**
 * Update Job Source Response
 * Response payload for job source update
 */
export interface UpdateJobSourceResponse {
  source: JobSource
  message?: string
}

/**
 * Delete Job Source Request
 * Path parameters for deleting a job source
 */
export interface DeleteJobSourceRequest {
  sourceId: string
}

/**
 * Delete Job Source Response
 * Response payload for job source deletion
 */
export interface DeleteJobSourceResponse {
  message: string
}

/**
 * Job Source Stats
 * Aggregate statistics for job sources
 */
export interface JobSourceStats {
  total: number
  byStatus: Record<JobSourceStatus, number>
}

/**
 * Get Job Source Stats Response
 * Response payload for job source statistics
 */
export interface GetJobSourceStatsResponse {
  stats: JobSourceStats
}
