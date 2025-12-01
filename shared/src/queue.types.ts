/**
 * Shared Queue Types
 *
 * Used by both portfolio (TypeScript) and job-finder (Python via type hints)
 *
 * IMPORTANT: When modifying these types, also update:
 * - Python models in job-finder/src/job_finder/queue/models.py
 * - SQLite schema expectations (infra/sqlite/migrations/*) so contracts stay aligned
 */

import type { TimestampLike } from "./time.types"
import type {
  QueueSettings,
  AISettings,
  AIProviderType,
  AIInterfaceType,
  AIProviderSelection,
} from "./config.types"
export type {
  QueueSettings,
  AISettings,
  AIProviderType,
  AIInterfaceType,
  AIProviderSelection,
} from "./config.types"

/**
 * Queue item status lifecycle:
 * pending → processing → success/failed/skipped/filtered
 *
 * - pending: In queue, waiting to be processed
 * - processing: Currently being processed
 * - filtered: Rejected by filter engine (did not pass intake filters)
 * - skipped: Skipped (duplicate or stop list blocked)
 * - success: Successfully processed and saved to job-matches
 * - failed: Processing error occurred (terminal)
 */
export type QueueStatus =
  | "pending"
  | "processing"
  | "success"
  | "failed"
  | "skipped"
  | "filtered"
  | "needs_review"

/**
 * Queue item types
 */
export type QueueItemType =
  | "job"
  | "company"
  | "scrape"
  | "source_discovery"
  | "scrape_source"
  | "agent_review"

/**
 * Source of queue submission
 */
export type QueueSource =
  | "user_submission"
  | "automated_scan"
  | "scraper"
  | "webhook"
  | "email"
  | "manual_submission"
  | "user_request"

/**
 * Configuration for scrape requests
 *
 * Used when QueueItemType is "scrape" to specify custom scraping parameters.
 *
 * Behavior:
 * - source_ids=null → scrape all available sources (with rotation)
 * - source_ids=[...] → scrape only specific sources
 * - target_matches=null → no early exit, scrape all allowed sources
 * - target_matches=N → stop after finding N potential matches
 * - max_sources=null → unlimited sources (until target_matches or all sources done)
 * - max_sources=N → stop after scraping N sources
 */
export interface ScrapeConfig {
  target_matches?: number | null // Stop after finding this many potential matches (null = no limit)
  max_sources?: number | null // Maximum number of sources to scrape (null = unlimited)
  source_ids?: string[] | null // Specific source IDs to scrape (null = all sources with rotation)
  min_match_score?: number | null // Override minimum match score threshold
}

/**
 * Source type hint for discovery
 */
export type SourceTypeHint = "auto" | "greenhouse" | "ashby" | "workday" | "rss" | "generic"

/**
 * Source priority tier for scheduling.
 */
export type SourceTier = "S" | "A" | "B" | "C" | "D"

/**
 * Configuration for source discovery requests
 *
 * Used when QueueItemType is "source_discovery" to discover and configure a new job source.
 *
 * Flow:
 * 1. job-finder-FE submits URL for discovery
 * 2. Job-finder detects source type (greenhouse, ashby, workday, rss, generic)
 * 3. For known types: validate and create config
 * 4. For generic: use AI selector discovery
 * 5. Test scrape to validate
 * 6. Create job-source document if successful
 */
export interface SourceDiscoveryConfig {
  url: string // URL to analyze and configure
  type_hint?: SourceTypeHint | null // Optional hint about source type (default: "auto")
  company_id?: string | null // Optional company reference
  company_name?: string | null // Optional company name
}

/**
 * Queue item stored in SQLite (job_queue table)
 *
 * Python equivalent: job_finder.queue.models.JobQueueItem
 */
export interface QueueItem {
  id?: string
  type: QueueItemType
  status: QueueStatus
  url?: string | null
  tracking_id?: string // UUID linking a task family
  parent_item_id?: string | null
  input?: Record<string, unknown> | null // Task-specific inputs (source IDs, configs, company hints, etc.)
  output?: Record<string, unknown> | null // Task results/telemetry (scraped data, pipeline state, stats, etc.)
  result_message?: string | null
  error_details?: string | null
  created_at: TimestampLike
  updated_at: TimestampLike
  processed_at?: TimestampLike | null
  completed_at?: TimestampLike | null

  /**
   * Deprecated convenience fields retained for backward compatibility with UI/API callers.
   * These are expected to be populated from `input`/`output` when present on the server/worker.
   */
  company_name?: string | null
  company_id?: string | null
  source?: QueueSource
  submitted_by?: string | null
  scrape_config?: ScrapeConfig | null
  scraped_data?: Record<string, any> | null
  source_discovery_config?: SourceDiscoveryConfig | null
  source_id?: string | null
  source_type?: string | null
  source_config?: Record<string, unknown> | null
  source_tier?: SourceTier | null
  pipeline_state?: Record<string, any> | null
  metadata?: Record<string, any> | null
}

/**
 * Stop list validation result
 */
export interface StopListCheckResult {
  allowed: boolean
  reason?: string
}

/**
 * Queue statistics
 */
export interface QueueStats {
  pending: number
  processing: number
  success: number
  failed: number
  skipped: number
  filtered: number
  total: number
}

/**
 * Job submission request body (API)
 */
export interface SubmitJobRequest {
  url: string
  companyName?: string
  companyUrl?: string // Company website/careers page URL for intake pipeline
  companyId?: string | null
  generationId?: string // Optional: Link to portfolio generation request ID
  source?: QueueSource
  title?: string
  description?: string
  location?: string
  techStack?: string
  bypassFilter?: boolean
  metadata?: Record<string, unknown>
}

/**
 * Job submission response (API)
 */
export interface SubmitJobResponse {
  status: "success" | "skipped" | "error"
  message: string
  queueItemId?: string
  queueItem?: QueueItem // Optional: Full queue item data (for immediate display)
  jobId?: string
}

/**
 * Scrape submission request body (API)
 */
export interface SubmitScrapeRequest {
  scrapeConfig?: ScrapeConfig
  /** @deprecated Use `scrapeConfig` */
  scrape_config?: ScrapeConfig
}

/**
 * Scrape submission response (API)
 */
export interface SubmitScrapeResponse {
  status: "success" | "error"
  message: string
  queueItemId?: string
  queueItem?: QueueItem
}

/**
 * Company submission request body (API)
 */
export interface SubmitCompanyRequest {
  companyName: string
  websiteUrl?: string // Optional: if not provided, agent will research to find it
  companyId?: string | null // Optional: existing company ID for re-analysis
  source?: "manual_submission" | "user_request" | "automated_scan"
}

/**
 * Company submission response (API)
 */
export interface SubmitCompanyResponse {
  status: "success" | "skipped" | "error"
  message: string
  queueItemId?: string
  queueItem?: QueueItem
}

/**
 * Source discovery submission request body (API)
 */
export interface SubmitSourceDiscoveryRequest {
  url: string
  companyName?: string
  companyId?: string | null
  typeHint?: SourceTypeHint
}

/**
 * Source discovery submission response (API)
 */
export interface SubmitSourceDiscoveryResponse {
  status: "success" | "error"
  message: string
  queueItemId?: string
  queueItem?: QueueItem
}

// Type guard helpers
export function isQueueStatus(status: string): status is QueueStatus {
  return ["pending", "processing", "success", "failed", "skipped", "filtered", "needs_review"].includes(status)
}

export function isQueueItemType(type: string): type is QueueItemType {
  return ["job", "company", "scrape", "source_discovery", "scrape_source", "agent_review"].includes(type)
}

export function isSourceTypeHint(hint: string): hint is SourceTypeHint {
  return ["auto", "greenhouse", "ashby", "workday", "rss", "generic"].includes(hint)
}
