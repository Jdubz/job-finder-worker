/**
 * Typed API client for job-applicator.
 *
 * Centralizes all API calls with proper shared type definitions,
 * eliminating fragile fallback patterns and ensuring type safety.
 */

import type {
  ApiSuccessResponse,
  GetConfigEntryResponse,
  GetApplicatorProfileResponse,
  ListJobMatchesResponse,
  GetJobMatchResponse,
  ListContentItemsResponse,
  ContentItemNode,
  PersonalInfo,
  JobMatchWithListing,
  GenerationStep,
  GeneratorDocument,
  GeneratorDocumentsResponse,
  GeneratorSingleDocumentResponse,
  ResumeContent,
  CoverLetterContent,
  DraftContentResponse,
} from "@shared/types"
import { fetchWithRetry, parseApiError } from "./utils.js"
import { logger } from "./logger.js"
import { getAuthHeaders } from "./auth-manager.js"

// Configuration from environment - use getter to read lazily after .env is loaded
// This MUST be a function, not a const, because ES module imports are hoisted
// and evaluated before any other code runs in main.ts (including .env loading)
function getApiUrl(): string {
  return process.env.JOB_FINDER_API_URL || "http://localhost:3000/api"
}

// Export for code that imports API_URL directly (evaluates at call time via getter)
export { getApiUrl as API_URL_GETTER }

/**
 * Helper to create fetch options with JSON content type and auth headers
 */
function fetchOptions(options: RequestInit = {}): RequestInit {
  const headers = new Headers(options.headers)
  headers.set("Content-Type", "application/json")

  // Add auth headers if available
  const authHeaders = getAuthHeaders()
  for (const [key, value] of Object.entries(authHeaders)) {
    headers.set(key, value)
  }

  return { ...options, headers }
}

// ============================================================================
// Config API
// ============================================================================

/**
 * Fetch personal info from config API
 */
export async function fetchPersonalInfo(): Promise<PersonalInfo> {
  const res = await fetchWithRetry(
    `${getApiUrl()}/config/personal-info`,
    fetchOptions(),
    { maxRetries: 2, timeoutMs: 15000 }
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(`Failed to fetch profile: ${errorMsg}`)
  }

  const data: ApiSuccessResponse<GetConfigEntryResponse> = await res.json()
  return data.data.config.payload as PersonalInfo
}

// ============================================================================
// Applicator API (optimized for form filling)
// ============================================================================

/**
 * Fetch pre-formatted profile text optimized for AI form filling.
 * Returns complete user data (personal info, EEO, work history, education, skills)
 * as markdown-formatted text ready for injection into prompts.
 */
export async function fetchApplicatorProfile(): Promise<string> {
  const url = `${getApiUrl()}/applicator/profile`
  logger.info(`Fetching applicator profile from: ${url}`)

  try {
    const res = await fetchWithRetry(url, fetchOptions(), { maxRetries: 2, timeoutMs: 15000 })

    if (!res.ok) {
      const errorMsg = await parseApiError(res)
      throw new Error(`Failed to fetch applicator profile: ${errorMsg}`)
    }

    const data: ApiSuccessResponse<GetApplicatorProfileResponse> = await res.json()
    return data.data.profileText
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error(`fetchApplicatorProfile failed: ${message}`)
    throw err
  }
}

// ============================================================================
// Content Items API
// ============================================================================

/**
 * Fetch content items (work history) from API.
 * Surfaced errors so callers can notify the user instead of silently degrading.
 */
export async function fetchContentItems(options?: {
  limit?: number
  parentId?: string | null
}): Promise<ContentItemNode[]> {
  const params = new URLSearchParams()
  if (options?.limit) params.set("limit", String(options.limit))
  if (options?.parentId) params.set("parentId", options.parentId)

  const url = `${getApiUrl()}/content-items${params.toString() ? `?${params}` : ""}`
  const res = await fetchWithRetry(url, fetchOptions(), { maxRetries: 2, timeoutMs: 15000 })

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    logger.error(`Content items fetch failed: ${res.status} - ${errorMsg}`)
    throw new Error(errorMsg)
  }

  const data: ApiSuccessResponse<ListContentItemsResponse> = await res.json()
  return data.data?.items || []
}

// ============================================================================
// Job Matches API
// ============================================================================

export interface FetchJobMatchesOptions {
  limit?: number
  status?: "active" | "ignored" | "applied" | "all"
  sortBy?: "score" | "date" | "updated"
  sortOrder?: "asc" | "desc"
}

/**
 * Fetch list of job matches
 */
export async function fetchJobMatches(
  options?: FetchJobMatchesOptions
): Promise<JobMatchWithListing[]> {
  const params = new URLSearchParams({
    limit: String(options?.limit || 50),
    status: options?.status || "active",
    sortBy: options?.sortBy || "updated",
    sortOrder: options?.sortOrder || "desc",
  })

  const res = await fetchWithRetry(
    `${getApiUrl()}/job-matches?${params}`,
    fetchOptions(),
    { maxRetries: 2, timeoutMs: 15000 }
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(errorMsg)
  }

  const data: ApiSuccessResponse<ListJobMatchesResponse> = await res.json()
  return data.data.matches
}

/**
 * Fetch a single job match by ID
 */
export async function fetchJobMatch(id: string): Promise<JobMatchWithListing> {
  const res = await fetchWithRetry(
    `${getApiUrl()}/job-matches/${id}`,
    fetchOptions(),
    { maxRetries: 2, timeoutMs: 15000 }
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(errorMsg)
  }

  const data: ApiSuccessResponse<GetJobMatchResponse> = await res.json()
  return data.data.match
}

/**
 * Find a job match by URL (searches recent matches)
 */
export async function findJobMatchByUrl(url: string): Promise<JobMatchWithListing | null> {
  // Include all statuses so previously applied/ignored jobs are detectable
  const matches = await fetchJobMatches({ limit: 100, status: "all" })

  /**
   * Normalize URL for comparison - strips protocol and trailing slashes.
   * Note: This differs from utils.normalizeUrl which preserves protocol (origin + pathname).
   * This version is specifically for URL matching where protocol differences should be ignored.
   */
  const normalizeForComparison = (u: string): string => {
    try {
      const parsed = new URL(u)
      return `${parsed.host}${parsed.pathname}`.replace(/\/$/, "").toLowerCase()
    } catch {
      return u.toLowerCase()
    }
  }

  const normalizedTarget = normalizeForComparison(url)

  for (const match of matches) {
    if (match.listing?.url && normalizeForComparison(match.listing.url) === normalizedTarget) {
      return match
    }
  }

  return null
}

/**
 * Update job match status
 */
export async function updateJobMatchStatus(
  id: string,
  status: "active" | "ignored" | "applied"
): Promise<void> {
  const res = await fetchWithRetry(
    `${getApiUrl()}/job-matches/${id}/status`,
    fetchOptions({
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
    { maxRetries: 2, timeoutMs: 15000 }
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(errorMsg)
  }
}

// ============================================================================
// Generator API
// ============================================================================

// Re-export GeneratorDocument for consumers that import it from api-client
export type { GeneratorDocument } from "@shared/types"

/**
 * Response from starting document generation
 */
export interface GenerationStartResponse {
  requestId: string
  nextStep: string | null
  steps: GenerationStep[]
  resumeUrl?: string
  coverLetterUrl?: string
}

/**
 * Response from executing a generation step
 */
export interface GenerationStepResponse {
  status: "pending" | "processing" | "awaiting_review" | "completed" | "failed"
  nextStep: string | null
  steps: GenerationStep[]
  resumeUrl?: string
  coverLetterUrl?: string
  error?: string
}

/**
 * Fetch documents for a job match.
 * Uses shared GeneratorDocumentsResponse type for type safety.
 */
export async function fetchDocuments(jobMatchId: string): Promise<GeneratorDocument[]> {
  const url = `${getApiUrl()}/generator/job-matches/${jobMatchId}/documents`
  const res = await fetchWithRetry(url, fetchOptions(), { maxRetries: 2, timeoutMs: 15000 })

  // 404 is fine - means no documents yet
  if (res.status === 404) {
    return []
  }

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(errorMsg)
  }

  const data: ApiSuccessResponse<GeneratorDocumentsResponse> = await res.json()
  return data.data.requests || []
}

/**
 * Fetch a specific generator request/document by ID.
 * Uses shared GeneratorSingleDocumentResponse type for type safety.
 */
export async function fetchGeneratorRequest(requestId: string): Promise<GeneratorDocument> {
  const url = `${getApiUrl()}/generator/requests/${requestId}`
  logger.info(`[API] Fetching document from: ${url}`)

  const res = await fetchWithRetry(
    url,
    fetchOptions(),
    { maxRetries: 2, timeoutMs: 15000 }
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    logger.error(`[API] Failed to fetch document (${res.status}): ${errorMsg}`)
    throw new Error(`Failed to fetch document: ${errorMsg}`)
  }

  const data: ApiSuccessResponse<GeneratorSingleDocumentResponse> = await res.json()
  return data.data.request
}

/**
 * Start document generation
 */
export async function startGeneration(options: {
  jobMatchId: string
  type: "resume" | "coverLetter" | "both"
}): Promise<GenerationStartResponse> {
  // First get the job match to get job details
  const match = await fetchJobMatch(options.jobMatchId)

  const res = await fetchWithRetry(
    `${getApiUrl()}/generator/start`,
    fetchOptions({
      method: "POST",
      body: JSON.stringify({
        generateType: options.type,
        job: {
          role: match.listing?.title || "Unknown Role",
          company: match.listing?.companyName || "Unknown Company",
          jobDescriptionUrl: match.listing?.url,
          jobDescriptionText: match.listing?.description,
          location: match.listing?.location,
        },
        jobMatchId: options.jobMatchId,
        date: new Date().toLocaleDateString(),
      }),
    }),
    { maxRetries: 2, timeoutMs: 30000 }
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(`Generation failed to start: ${errorMsg}`)
  }

  const data: ApiSuccessResponse<GenerationStartResponse> = await res.json()
  return data.data
}

/**
 * Execute the next generation step
 */
export async function executeGenerationStep(requestId: string): Promise<GenerationStepResponse> {
  const res = await fetchWithRetry(
    `${getApiUrl()}/generator/step/${requestId}`,
    fetchOptions({
      method: "POST",
      body: JSON.stringify({}),
    }),
    { maxRetries: 2, timeoutMs: 120000 } // Match FE timeout — AI generation can take 60-90s
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(`Step execution failed: ${errorMsg}`)
  }

  const data: ApiSuccessResponse<GenerationStepResponse> = await res.json()
  return data.data
}

/**
 * Fetch draft content awaiting review
 */
export async function fetchDraftContent(requestId: string): Promise<DraftContentResponse> {
  const res = await fetchWithRetry(
    `${getApiUrl()}/generator/requests/${requestId}/draft`,
    fetchOptions(),
    { maxRetries: 2, timeoutMs: 15000 }
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(`Failed to fetch draft content: ${errorMsg}`)
  }

  const data: ApiSuccessResponse<DraftContentResponse> = await res.json()
  return data.data
}

/**
 * Submit reviewed/edited document content
 */
export async function submitDocumentReview(
  requestId: string,
  documentType: "resume" | "coverLetter",
  content: ResumeContent | CoverLetterContent
): Promise<GenerationStepResponse> {
  const res = await fetchWithRetry(
    `${getApiUrl()}/generator/requests/${requestId}/submit-review`,
    fetchOptions({
      method: "POST",
      body: JSON.stringify({ documentType, content }),
    }),
    { maxRetries: 2, timeoutMs: 120000 } // submit-review triggers render-pdf which can take 30s+
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(`Failed to submit review: ${errorMsg}`)
  }

  const data: ApiSuccessResponse<GenerationStepResponse> = await res.json()
  return data.data
}

/**
 * Reject document review with feedback and request AI retry
 */
export async function rejectDocumentReview(
  requestId: string,
  documentType: "resume" | "coverLetter",
  feedback: string
): Promise<{ content: ResumeContent | CoverLetterContent }> {
  const res = await fetchWithRetry(
    `${getApiUrl()}/generator/requests/${requestId}/reject-review`,
    fetchOptions({
      method: "POST",
      body: JSON.stringify({ documentType, feedback }),
    }),
    { maxRetries: 1, timeoutMs: 120000 } // AI regeneration + render can take 60-90s
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(`Failed to reject review: ${errorMsg}`)
  }

  const data: ApiSuccessResponse<{ content: ResumeContent | CoverLetterContent }> = await res.json()
  return data.data
}

// ============================================================================
// Queue API
// ============================================================================

export interface SubmitJobResponse {
  id: string
  status: string
}

/**
 * Submit a job to the processing queue
 */
export async function submitJobToQueue(job: {
  url: string
  title?: string | null
  description?: string | null
  location?: string | null
  techStack?: string | null
  companyName?: string | null
  bypassFilter?: boolean
  source?: string
}): Promise<SubmitJobResponse> {
  const res = await fetchWithRetry(
    `${getApiUrl()}/queue/jobs`,
    fetchOptions({
      method: "POST",
      body: JSON.stringify({
        ...job,
        bypassFilter: job.bypassFilter ?? true,
        source: job.source ?? "user_submission",
      }),
    }),
    { maxRetries: 2, timeoutMs: 15000 }
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(`Failed to submit job: ${errorMsg}`)
  }

  const data: ApiSuccessResponse<{ queueItem: { id: string; status: string } }> = await res.json()
  return {
    id: data.data.queueItem.id,
    status: data.data.queueItem.status,
  }
}

// ============================================================================
// Re-export for convenience
// ============================================================================

// Export getter function - callers should use getApiUrl() to get current API URL
export { getApiUrl }
