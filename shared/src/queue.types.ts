/**
 * Shared Queue Types
 *
 * Used by both portfolio (TypeScript) and job-finder (Python via type hints)
 *
 * IMPORTANT: When modifying these types, also update:
 * - Python models in job-finder/src/job_finder/queue/models.py
 * - SQLite schema expectations (infra/sqlite/migrations/*) so contracts stay aligned
 */

import type { TimestampLike } from "./firestore.types"

/**
 * Queue item status lifecycle:
 * pending → processing → success/failed/skipped/filtered
 *
 * - pending: In queue, waiting to be processed
 * - processing: Currently being processed
 * - filtered: Rejected by filter engine (did not pass intake filters)
 * - skipped: Skipped (duplicate or stop list blocked)
 * - success: Successfully processed and saved to job-matches
 * - failed: Processing error occurred
 */
export type QueueStatus = "pending" | "processing" | "success" | "failed" | "skipped" | "filtered"

/**
 * Queue item types
 */
export type QueueItemType = "job" | "company" | "scrape" | "source_discovery" | "scrape_source"

/**
 * Granular sub-tasks for job processing pipeline.
 *
 * When a JOB queue item has a sub_task, it represents one step in the
 * multi-stage processing pipeline. Items without sub_task (legacy) are
 * processed monolithically through all stages.
 *
 * Pipeline flow:
 * 1. scrape: Fetch HTML and extract basic job data (Claude Haiku)
 * 2. filter: Apply strike-based filtering (no AI)
 * 3. analyze: AI matching and resume intake generation (Claude Sonnet)
 * 4. save: Save results to job-matches (no AI)
 */
export type JobSubTask = "scrape" | "filter" | "analyze" | "save"

/**
 * Granular sub-tasks for company processing pipeline.
 *
 * When a COMPANY queue item has a company_sub_task, it represents one step in the
 * multi-stage processing pipeline. Items without company_sub_task (legacy) are
 * processed monolithically through all stages.
 *
 * Pipeline flow:
 * 1. fetch: Fetch website HTML content (cheap AI if needed)
 * 2. extract: Extract company info using AI (expensive AI)
 * 3. analyze: Tech stack detection, job board discovery, priority scoring (rule-based)
 * 4. save: Save to Firestore, spawn source_discovery if job board found (no AI)
 */
export type CompanySubTask = "fetch" | "extract" | "analyze" | "save"

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
export type SourceTypeHint = "auto" | "greenhouse" | "workday" | "rss" | "generic"

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
 * 2. Job-finder detects source type (greenhouse, workday, rss, generic)
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
  auto_enable?: boolean // Auto-enable if discovery succeeds (default: true)
  validation_required?: boolean // Require manual validation before enabling (default: false)
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
  url: string
  company_name: string
  company_id: string | null
  source: QueueSource
  /**
   * @deprecated Will be removed after 2024-12-31.
   * Use the 'source' field to determine submission origin.
   * User UID for user submissions (optional - single-owner system)
   */
  submitted_by?: string | null
  retry_count: number
  max_retries: number
  result_message?: string
  error_details?: string
  created_at: TimestampLike
  updated_at: TimestampLike
  processed_at?: TimestampLike | null
  completed_at?: TimestampLike | null
  scrape_config?: ScrapeConfig | null // Configuration for scrape requests (only used when type is "scrape")
  scraped_data?: Record<string, any> | null // Pre-scraped job or company data
  source_discovery_config?: SourceDiscoveryConfig | null // Configuration for source discovery (only used when type is "source_discovery")
  source_id?: string | null // job_sources row reference when spawned from source scheduler
  source_type?: string | null // greenhouse, workday, rss, lever, api, scraper
  source_config?: Record<string, unknown> | null // Serialized source configuration blob
  source_tier?: SourceTier | null // Priority tier for scheduling

  // Granular pipeline fields (only used when type is "job" with sub_task)
  sub_task?: JobSubTask | null // Granular pipeline step (scrape/filter/analyze/save). null = legacy monolithic processing
  pipeline_state?: Record<string, any> | null // State passed between pipeline steps (scraped data, filter results, etc.)
  parent_item_id?: string | null // Document ID of parent item that spawned this sub-task

  // Company granular pipeline fields (only used when type is "company" with company_sub_task)
  company_sub_task?: CompanySubTask | null // Company pipeline step (fetch/extract/analyze/save). null = legacy monolithic processing

  // Additional metadata (for pre-generated documents or other contextual data)
  metadata?: Record<string, any> | null
  pipeline_stage?: string | null // High-level pipeline stage (scrape/filter/analyze/save/etc.)

  // Loop-prevention / provenance fields
  tracking_id?: string // Stable identifier shared by all spawned children
  ancestry_chain?: string[] // Ordered chain of parent IDs from root -> current
  spawn_depth?: number // Depth within ancestry (root = 0)
  max_spawn_depth?: number // Safety guard to prevent runaway spawning
}

/**
 * Stop list configuration (job-finder-config/stop-list)
 */
export interface StopList {
  excludedCompanies: string[]
  excludedKeywords: string[]
  excludedDomains: string[]
  updatedAt?: TimestampLike
  updatedBy?: string // User email
}

/**
 * Queue settings (job-finder-config/queue-settings)
 */
export interface QueueSettings {
  maxRetries: number
  retryDelaySeconds: number
  processingTimeout: number
  updatedAt?: TimestampLike
  updatedBy?: string // User email
}

/**
 * AI provider options
 */
export type AIProvider = "claude" | "openai" | "gemini"

/**
 * AI settings (job-finder-config/ai-settings)
 */
export interface AISettings {
  provider: AIProvider
  model: string
  minMatchScore: number
  costBudgetDaily: number
  updatedAt?: TimestampLike
  updatedBy?: string // User email
}

/**
 * Job match result (job-matches collection)
 *
 * DEPRECATED: Use JobMatch from job.types.ts instead.
 * This interface is kept for backwards compatibility only.
 *
 * @deprecated Import JobMatch from './job.types' instead
 */
export interface JobMatchLegacy {
  id?: string
  url: string
  company_name: string
  company_id?: string | null
  job_title: string
  match_score: number
  match_reasons: string[]
  job_description: string
  requirements: string[]
  location?: string | null
  salary_range?: string | null
  analyzed_at: Date | any // FirebaseFirestore.Timestamp
  created_at: Date | any // FirebaseFirestore.Timestamp
  submitted_by: string | null
  queue_item_id: string
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
  websiteUrl: string
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

// Type guard helpers
export function isQueueStatus(status: string): status is QueueStatus {
  return ["pending", "processing", "success", "failed", "skipped", "filtered"].includes(status)
}

export function isQueueItemType(type: string): type is QueueItemType {
  return ["job", "company", "scrape", "source_discovery", "scrape_source"].includes(type)
}

export function isSourceTypeHint(hint: string): hint is SourceTypeHint {
  return ["auto", "greenhouse", "workday", "rss", "generic"].includes(hint)
}
