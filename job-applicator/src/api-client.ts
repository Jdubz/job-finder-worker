/**
 * Typed API client for job-applicator.
 *
 * Centralizes all API calls with proper shared type definitions,
 * eliminating fragile fallback patterns and ensuring type safety.
 */

import type {
  ApiSuccessResponse,
  GetConfigEntryResponse,
  ListJobMatchesResponse,
  GetJobMatchResponse,
  ListContentItemsResponse,
  ContentItemNode,
  PersonalInfo,
  JobMatchWithListing,
  GenerationStep,
} from "@shared/types"
import { fetchWithRetry, parseApiError } from "./utils.js"
import { logger } from "./logger.js"

// Configuration from environment
const API_URL = process.env.JOB_FINDER_API_URL || "http://localhost:3000/api"

/**
 * Helper to create fetch options with JSON content type
 */
function fetchOptions(options: RequestInit = {}): RequestInit {
  const headers = new Headers(options.headers)
  headers.set("Content-Type", "application/json")
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
    `${API_URL}/config/personal-info`,
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
  const res = await fetchWithRetry(
    `${API_URL}/applicator/profile`,
    fetchOptions(),
    { maxRetries: 2, timeoutMs: 15000 }
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(`Failed to fetch applicator profile: ${errorMsg}`)
  }

  const data: ApiSuccessResponse<{ profileText: string }> = await res.json()
  return data.data.profileText
}

// ============================================================================
// Content Items API
// ============================================================================

/**
 * Fetch content items (work history) from API
 * Returns empty array on failure (non-critical data)
 */
export async function fetchContentItems(options?: {
  limit?: number
  parentId?: string | null
}): Promise<ContentItemNode[]> {
  try {
    const params = new URLSearchParams()
    if (options?.limit) params.set("limit", String(options.limit))
    if (options?.parentId) params.set("parentId", options.parentId)

    const url = `${API_URL}/content-items${params.toString() ? `?${params}` : ""}`
    const res = await fetchWithRetry(url, fetchOptions(), { maxRetries: 2, timeoutMs: 15000 })

    if (!res.ok) {
      logger.warn(`Content items fetch failed: ${res.status}`)
      return []
    }

    const data: ApiSuccessResponse<ListContentItemsResponse> = await res.json()
    return data.data?.items || []
  } catch (err) {
    logger.warn("Content items unavailable:", err)
    return []
  }
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
    `${API_URL}/job-matches?${params}`,
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
    `${API_URL}/job-matches/${id}`,
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
  const matches = await fetchJobMatches({ limit: 100 })

  // Normalize URL for comparison (remove trailing slashes, protocol variations)
  const normalizeUrl = (u: string): string => {
    try {
      const parsed = new URL(u)
      return `${parsed.host}${parsed.pathname}`.replace(/\/$/, "").toLowerCase()
    } catch {
      return u.toLowerCase()
    }
  }

  const normalizedTarget = normalizeUrl(url)

  for (const match of matches) {
    if (match.listing?.url && normalizeUrl(match.listing.url) === normalizedTarget) {
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
    `${API_URL}/job-matches/${id}/status`,
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

export interface GeneratorDocument {
  id: string
  generateType: "resume" | "coverLetter" | "both"
  status: "pending" | "processing" | "completed" | "failed"
  resumeUrl?: string
  coverLetterUrl?: string
  createdAt: string
  jobMatchId?: string
}

export interface GenerationStartResponse {
  requestId: string
  nextStep: string | null
  steps: GenerationStep[]
  resumeUrl?: string
  coverLetterUrl?: string
}

export interface GenerationStepResponse {
  status: "pending" | "processing" | "completed" | "failed"
  nextStep: string | null
  steps: GenerationStep[]
  resumeUrl?: string
  coverLetterUrl?: string
  error?: string
}

/**
 * Fetch documents for a job match
 */
export async function fetchDocuments(jobMatchId: string): Promise<GeneratorDocument[]> {
  const url = `${API_URL}/generator/job-matches/${jobMatchId}/documents`
  const res = await fetchWithRetry(url, fetchOptions(), { maxRetries: 2, timeoutMs: 15000 })

  // 404 is fine - means no documents yet
  if (res.status === 404) {
    return []
  }

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(errorMsg)
  }

  const data: ApiSuccessResponse<{ documents: GeneratorDocument[] }> = await res.json()
  return data.data.documents || []
}

/**
 * Fetch a specific generator request/document by ID
 */
export async function fetchGeneratorRequest(requestId: string): Promise<GeneratorDocument> {
  const res = await fetchWithRetry(
    `${API_URL}/generator/requests/${requestId}`,
    fetchOptions(),
    { maxRetries: 2, timeoutMs: 15000 }
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(`Failed to fetch document: ${errorMsg}`)
  }

  const data: ApiSuccessResponse<{ request: GeneratorDocument }> = await res.json()
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
    `${API_URL}/generator/start`,
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
    `${API_URL}/generator/step/${requestId}`,
    fetchOptions({
      method: "POST",
      body: JSON.stringify({}),
    }),
    { maxRetries: 2, timeoutMs: 60000 } // Longer timeout for generation steps
  )

  if (!res.ok) {
    const errorMsg = await parseApiError(res)
    throw new Error(`Step execution failed: ${errorMsg}`)
  }

  const data: ApiSuccessResponse<GenerationStepResponse> = await res.json()
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
    `${API_URL}/queue/jobs`,
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

export { API_URL }
