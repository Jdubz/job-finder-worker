/**
 * Type Guard Functions
 *
 * Runtime validation helpers for shared domain types and API responses.
 * Use these guards when reading from persistence layers, handling API payloads, or
 * validating user input across services.
 *
 * Usage:
 * ```typescript
 * if (isQueueItem(data)) {
 *   // TypeScript narrows data to QueueItem here
 *   console.log(data.status)
 * }
 * ```
 */

import type { QueueItem, QueueSource } from "./queue.types"
import type {
  MatchPolicy,
  PreFilterPolicy,
  AIProviderType,
  AIInterfaceType,
  WorkerSettings,
  AISettings,
  AIProviderOption,
  ScoringConfig,
  PromptConfig,
} from "./config.types"
import type { PersonalInfo } from "./generator.types"
// Import and re-export type guards from queue.types for convenience
import {
  isQueueStatus as queueStatusGuard,
  isQueueItemType as queueItemTypeGuard,
  isSourceTypeHint as sourceTypeHintGuard,
} from "./queue.types"
export {
  queueStatusGuard as isQueueStatus,
  queueItemTypeGuard as isQueueItemType,
  sourceTypeHintGuard as isSourceTypeHint,
}
import type {
  JobListing,
  JobListingRecord,
  JobMatch,
  Company,
  ResumeIntakeData,
  ExperienceHighlight,
  ProjectRecommendation,
  GapMitigation,
} from "./job.types"
import type { ContentItem } from "./content-item.types"
import type { GenerationType, GenerationStepStatus } from "./generator.types"
import type { ApiResponse, ApiSuccessResponse, ApiErrorResponse } from "./api.types"

/**
 * Helper: Check if value is a non-null object
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Helper: Check if value is a string array
 */
function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

/**
 * Helper: Check if value is a Date or structured timestamp
 */
function isDateLike(value: unknown): boolean {
  if (value instanceof Date) return true
  if (!isObject(value)) return false
  // Check for structured timestamp shape
  return (
    typeof (value as any).seconds === "number" &&
    typeof (value as any).nanoseconds === "number" &&
    typeof (value as any).toDate === "function"
  )
}

// ============================================
// Queue Types Guards
// ============================================

// Note: isQueueStatus and isQueueItemType are exported from queue.types.ts
// and re-exported here for convenience

/**
 * Type guard for QueueSource
 */
export function isQueueSource(value: unknown): value is QueueSource {
  return (
    typeof value === "string" &&
    [
      "user_submission",
      "automated_scan",
      "scraper",
      "webhook",
      "email",
      "manual_submission",
      "user_request",
    ].includes(value)
  )
}

/**
 * Type guard for QueueItem
 */
export function isQueueItem(value: unknown): value is QueueItem {
  if (!isObject(value)) return false

  const item = value as Partial<QueueItem>

  // Check required fields
  return (
    queueItemTypeGuard(item.type as string) &&
    queueStatusGuard(item.status as string) &&
    (item.url === undefined || item.url === null || typeof item.url === "string") &&
    isDateLike(item.created_at) &&
    isDateLike(item.updated_at)
  )
}

/**
 * Type guard for AIProviderType
 */
export function isAIProviderType(value: unknown): value is AIProviderType {
  return typeof value === "string" && ["codex", "claude", "openai", "gemini"].includes(value)
}

/**
 * Type guard for AIInterfaceType
 */
export function isAIInterfaceType(value: unknown): value is AIInterfaceType {
  return typeof value === "string" && ["cli", "api"].includes(value)
}

/**
 * Type guard for AISettings
 */
export function isAISettings(value: unknown): value is AISettings {
  if (!isObject(value)) return false

  const settings = value as Partial<AISettings>

  const sections: Array<keyof AISettings> = ["worker", "documentGenerator"]

  const isValidSelection = (sel: any): sel is AISettings["worker"]["selected"] =>
    isObject(sel) &&
    isAIProviderType(sel.provider) &&
    isAIInterfaceType(sel.interface) &&
    typeof sel.model === "string"

  for (const section of sections) {
    const payload = (settings as any)[section]
    if (!isObject(payload) || !isValidSelection((payload as any).selected)) return false
  }

  if (!Array.isArray(settings.options)) return false

  const options = settings.options as AIProviderOption[]

  for (const provider of options) {
    if (
      !isObject(provider) ||
      !isAIProviderType((provider as any).value) ||
      !Array.isArray((provider as any).interfaces)
    ) {
      return false
    }

    for (const iface of provider.interfaces) {
      if (
        !isObject(iface) ||
        !isAIInterfaceType((iface as any).value) ||
        typeof (iface as any).enabled !== "boolean" ||
        !Array.isArray((iface as any).models) ||
        !(iface as any).models.every((m: unknown) => typeof m === "string")
      ) {
        return false
      }
      if ((iface as any).reason !== undefined && typeof (iface as any).reason !== "string") {
        return false
      }
    }
  }

  // Ensure selections match available tiered options
  const hasValidCombination = (sel: AISettings["worker"]["selected"]) =>
    options.some(
      (provider: AIProviderOption) =>
        provider.value === sel.provider &&
        provider.interfaces.some(
          (iface) => iface.value === sel.interface && iface.models.includes(sel.model)
        )
    )

  return (
    hasValidCombination((settings.worker as any).selected) &&
    hasValidCombination((settings.documentGenerator as any).selected)
  )

}

/**
 * Type guard for ScoringConfig
 */
export function isScoringConfig(value: unknown): value is ScoringConfig {
  if (!isObject(value)) return false
  const v = value as Partial<ScoringConfig>

  // Check minScore
  if (typeof v.minScore !== "number") return false

  // Check weights
  if (!isObject(v.weights)) return false
  const weights = v.weights as any
  if (
    typeof weights.skillMatch !== "number" ||
    typeof weights.experienceMatch !== "number" ||
    typeof weights.seniorityMatch !== "number"
  ) {
    return false
  }

  // Check seniority
  if (!isObject(v.seniority)) return false
  const seniority = v.seniority as any
  if (
    !isStringArray(seniority.preferred) ||
    !isStringArray(seniority.acceptable) ||
    !isStringArray(seniority.rejected) ||
    typeof seniority.preferredScore !== "number" ||
    typeof seniority.acceptableScore !== "number" ||
    typeof seniority.rejectedScore !== "number"
  ) {
    return false
  }

  // Check location
  if (!isObject(v.location)) return false
  const location = v.location as any
  if (
    typeof location.allowRemote !== "boolean" ||
    typeof location.allowHybrid !== "boolean" ||
    typeof location.allowOnsite !== "boolean" ||
    typeof location.userTimezone !== "number" ||
    typeof location.maxTimezoneDiffHours !== "number" ||
    typeof location.perHourScore !== "number" ||
    typeof location.hybridSameCityScore !== "number"
  ) {
    return false
  }

  // Check technology
  if (!isObject(v.technology)) return false
  const technology = v.technology as any
  if (
    !isStringArray(technology.required) ||
    !isStringArray(technology.preferred) ||
    !isStringArray(technology.disliked) ||
    !isStringArray(technology.rejected) ||
    typeof technology.requiredScore !== "number" ||
    typeof technology.preferredScore !== "number" ||
    typeof technology.dislikedScore !== "number"
  ) {
    return false
  }

  // Check salary
  if (!isObject(v.salary)) return false
  const salary = v.salary as any
  if (
    (salary.minimum !== null && typeof salary.minimum !== "number") ||
    (salary.target !== null && typeof salary.target !== "number") ||
    typeof salary.belowTargetScore !== "number"
  ) {
    return false
  }

  // Check experience
  if (!isObject(v.experience)) return false
  const experience = v.experience as any
  if (
    typeof experience.userYears !== "number" ||
    typeof experience.maxRequired !== "number" ||
    typeof experience.overqualifiedScore !== "number"
  ) {
    return false
  }

  return true
}

/**
 * Type guard for MatchPolicy (complete match policy with all sections)
 * Validates all required sections: freshness, roleFit, company, dealbreakers
 */
export function isMatchPolicy(value: unknown): value is MatchPolicy {
  // First check base ScoringConfig fields
  if (!isScoringConfig(value)) return false

  const v = value as Partial<MatchPolicy>

  // Check freshness section
  if (!isObject(v.freshness)) return false
  const freshness = v.freshness as Record<string, unknown>
  if (
    typeof freshness.freshDays !== "number" ||
    typeof freshness.freshScore !== "number" ||
    typeof freshness.staleDays !== "number" ||
    typeof freshness.staleScore !== "number" ||
    typeof freshness.veryStaleDays !== "number" ||
    typeof freshness.veryStaleScore !== "number" ||
    typeof freshness.repostScore !== "number"
  ) {
    return false
  }

  // Check roleFit section
  if (!isObject(v.roleFit)) return false
  const roleFit = v.roleFit as Record<string, unknown>
  if (
    !isStringArray(roleFit.preferred) ||
    !isStringArray(roleFit.acceptable) ||
    !isStringArray(roleFit.penalized) ||
    !isStringArray(roleFit.rejected) ||
    typeof roleFit.preferredScore !== "number" ||
    typeof roleFit.penalizedScore !== "number"
  ) {
    return false
  }

  // Check company section
  if (!isObject(v.company)) return false
  const company = v.company as Record<string, unknown>
  if (
    typeof company.preferredCityScore !== "number" ||
    (company.preferredCity !== undefined && typeof company.preferredCity !== "string") ||
    typeof company.remoteFirstScore !== "number" ||
    typeof company.aiMlFocusScore !== "number" ||
    typeof company.largeCompanyScore !== "number" ||
    typeof company.smallCompanyScore !== "number" ||
    typeof company.largeCompanyThreshold !== "number" ||
    typeof company.smallCompanyThreshold !== "number" ||
    typeof company.startupScore !== "number"
  ) {
    return false
  }

  return true
}

export function isPreFilterPolicy(value: unknown): value is PreFilterPolicy {
  if (!isObject(value)) return false
  const v = value as Record<string, unknown>

  if (!isObject(v.title)) return false
  const title = v.title as Record<string, unknown>
  if (!isStringArray(title.requiredKeywords) || !isStringArray(title.excludedKeywords)) return false

  if (!isObject(v.freshness)) return false
  if (typeof (v.freshness as any).maxAgeDays !== "number") return false

  if (!isObject(v.workArrangement)) return false
  const wa = v.workArrangement as Record<string, unknown>
  if (
    typeof wa.allowRemote !== "boolean" ||
    typeof wa.allowHybrid !== "boolean" ||
    typeof wa.allowOnsite !== "boolean"
  ) {
    return false
  }
  if (typeof wa.willRelocate !== "boolean") return false
  if (typeof wa.userLocation !== "string") return false
  if (wa.willRelocate === false && wa.userLocation.trim() === "") return false
  if (wa.userTimezone !== undefined && typeof wa.userTimezone !== "number") return false
  if (wa.maxTimezoneDiffHours !== undefined && typeof wa.maxTimezoneDiffHours !== "number") return false

  if (!isObject(v.employmentType)) return false
  const et = v.employmentType as Record<string, unknown>
  if (
    typeof et.allowFullTime !== "boolean" ||
    typeof et.allowPartTime !== "boolean" ||
    typeof et.allowContract !== "boolean"
  ) {
    return false
  }

  if (!isObject(v.salary)) return false
  const sal = v.salary as Record<string, unknown>
  if (sal.minimum !== null && typeof sal.minimum !== "number") return false

  if (!isObject(v.technology)) return false
  const tech = v.technology as Record<string, unknown>
  if (!isStringArray(tech.rejected)) return false

  return true
}

export function isWorkerSettings(value: unknown): value is WorkerSettings {
  if (!isObject(value)) return false
  const v = value as Record<string, unknown>

  // scraping
  const scraping = (v as any).scraping
  if (!isObject(scraping)) return false
  if (typeof scraping.requestTimeoutSeconds !== "number") return false
  if (typeof scraping.maxHtmlSampleLength !== "number") return false
  if (scraping.fetchDelaySeconds !== undefined && typeof scraping.fetchDelaySeconds !== "number") return false

  // text limits
  const textLimits = (v as any).textLimits
  if (!isObject(textLimits)) return false
  const tl = textLimits as any
  const tlKeys = [
    "minCompanyPageLength",
    "minSparseCompanyInfoLength",
    "maxIntakeTextLength",
    "maxIntakeDescriptionLength",
    "maxIntakeFieldLength",
    "maxDescriptionPreviewLength",
    "maxCompanyInfoTextLength",
  ]
  if (!tlKeys.every((k) => typeof tl[k] === "number")) return false

  // runtime
  const runtime = (v as any).runtime
  if (!isObject(runtime)) return false
  const rt = runtime as any
  if (
    typeof rt.processingTimeoutSeconds !== "number" ||
    typeof rt.isProcessingEnabled !== "boolean" ||
    typeof rt.taskDelaySeconds !== "number" ||
    typeof rt.pollIntervalSeconds !== "number"
  ) {
    return false
  }
  if (rt.scrapeConfig !== undefined) {
    if (!isObject(rt.scrapeConfig)) return false
    const sc = rt.scrapeConfig as any
    if (
      (sc.target_matches !== undefined && sc.target_matches !== null && typeof sc.target_matches !== "number") ||
      (sc.max_sources !== undefined && sc.max_sources !== null && typeof sc.max_sources !== "number") ||
      (sc.source_ids !== undefined &&
        !(Array.isArray(sc.source_ids) && sc.source_ids.every((id: unknown) => typeof id === "string")))
    ) {
      return false
    }
  }

  // optional health
  if (v.health !== undefined) {
    if (!isObject(v.health)) return false
    if (
      typeof (v.health as any).maxConsecutiveFailures !== "number" ||
      typeof (v.health as any).healthCheckIntervalSeconds !== "number"
    ) {
      return false
    }
  }

  // optional cache
  if (v.cache !== undefined) {
    if (!isObject(v.cache)) return false
    if (
      typeof (v.cache as any).companyInfoTtlSeconds !== "number" ||
      typeof (v.cache as any).sourceConfigTtlSeconds !== "number"
    ) {
      return false
    }
  }

  return true
}

export function isPersonalInfo(value: unknown): value is PersonalInfo {
  if (!isObject(value)) return false
  const v = value as Partial<PersonalInfo>
  return typeof v.name === "string" && typeof v.email === "string"
}

/**
 * Type guard for PromptConfig
 */
export function isPromptConfig(value: unknown): value is PromptConfig {
  if (!isObject(value)) return false
  const v = value as Partial<PromptConfig>
  return (
    typeof v.resumeGeneration === "string" &&
    typeof v.coverLetterGeneration === "string" &&
    typeof v.jobScraping === "string" &&
    typeof v.jobMatching === "string"
  )
}

// ============================================
// Generator Types Guards
// ============================================

/**
 * Type guard for GenerationType
 */
export function isGenerationType(value: unknown): value is GenerationType {
  return typeof value === "string" && ["resume", "coverLetter", "both"].includes(value)
}

// Note: isAIProviderType is defined above with config types (codex, claude, openai, gemini)
// and covers all generator use cases

/**
 * Type guard for GenerationStepStatus
 */
export function isGenerationStepStatus(value: unknown): value is GenerationStepStatus {
  return (
    typeof value === "string" &&
    ["pending", "in_progress", "completed", "failed", "skipped"].includes(value)
  )
}

// ============================================
// Job Types Guards
// ============================================

/**
 * Type guard for ExperienceHighlight
 */
export function isExperienceHighlight(value: unknown): value is ExperienceHighlight {
  if (!isObject(value)) return false

  const exp = value as Partial<ExperienceHighlight>

  return (
    typeof exp.company === "string" &&
    typeof exp.title === "string" &&
    isStringArray(exp.pointsToEmphasize)
  )
}

/**
 * Type guard for ProjectRecommendation
 */
export function isProjectRecommendation(value: unknown): value is ProjectRecommendation {
  if (!isObject(value)) return false

  const proj = value as Partial<ProjectRecommendation>

  return (
    typeof proj.name === "string" &&
    typeof proj.whyRelevant === "string" &&
    isStringArray(proj.pointsToHighlight)
  )
}

/**
 * Type guard for GapMitigation
 */
export function isGapMitigation(value: unknown): value is GapMitigation {
  if (!isObject(value)) return false

  const gap = value as Partial<GapMitigation>

  return (
    typeof gap.missingSkill === "string" &&
    typeof gap.mitigationStrategy === "string" &&
    typeof gap.coverLetterPoint === "string"
  )
}

/**
 * Type guard for ResumeIntakeData
 */
export function isResumeIntakeData(value: unknown): value is ResumeIntakeData {
  if (!isObject(value)) return false

  const data = value as Partial<ResumeIntakeData>

  // Validate optional gapMitigation field if present
  if (data.gapMitigation !== undefined) {
    if (!Array.isArray(data.gapMitigation) || !data.gapMitigation.every(isGapMitigation)) {
      return false
    }
  }

  return (
    typeof data.jobId === "string" &&
    typeof data.jobTitle === "string" &&
    typeof data.company === "string" &&
    typeof data.targetSummary === "string" &&
    isStringArray(data.skillsPriority) &&
    Array.isArray(data.experienceHighlights) &&
    data.experienceHighlights.every(isExperienceHighlight) &&
    Array.isArray(data.projectsToInclude) &&
    data.projectsToInclude.every(isProjectRecommendation) &&
    isStringArray(data.achievementAngles) &&
    isStringArray(data.atsKeywords)
  )
}

/**
 * Type guard for JobListing
 */
export function isJobListing(value: unknown): value is JobListing {
  if (!isObject(value)) return false

  const job = value as Partial<JobListing>

  // Check required fields
  return (
    typeof job.title === "string" &&
    typeof job.company === "string" &&
    typeof job.companyWebsite === "string" &&
    typeof job.location === "string" &&
    typeof job.description === "string" &&
    typeof job.url === "string"
  )
}

/**
 * Type guard for JobListingRecord
 */
export function isJobListingRecord(value: unknown): value is JobListingRecord {
  if (!isObject(value)) return false

  const listing = value as Partial<JobListingRecord>

  // Check required fields
  return (
    typeof listing.id === "string" &&
    typeof listing.url === "string" &&
    typeof listing.title === "string" &&
    typeof listing.companyName === "string" &&
    typeof listing.description === "string" &&
    (listing.status === "pending" ||
      listing.status === "analyzing" ||
      listing.status === "analyzed" ||
      listing.status === "skipped" ||
      listing.status === "matched") &&
    isDateLike(listing.createdAt) &&
    isDateLike(listing.updatedAt)
  )
}

/**
 * Type guard for JobMatch
 */
export function isJobMatch(value: unknown): value is JobMatch {
  if (!isObject(value)) return false

  const match = value as Partial<JobMatch>

  // Check required fields
  return (
    typeof match.jobListingId === "string" &&
    typeof match.matchScore === "number" &&
    isStringArray(match.matchedSkills) &&
    isStringArray(match.missingSkills) &&
    isStringArray(match.matchReasons) &&
    isStringArray(match.keyStrengths) &&
    isStringArray(match.potentialConcerns) &&
    typeof match.experienceMatch === "number" &&
    isStringArray(match.customizationRecommendations) &&
    isDateLike(match.analyzedAt) &&
    isDateLike(match.createdAt) &&
    (match.submittedBy === null || typeof match.submittedBy === "string") &&
    typeof match.queueItemId === "string"
  )
}

/**
 * Type guard for Company
 */
export function isCompany(value: unknown): value is Company {
  if (!isObject(value)) return false

  const company = value as Partial<Company>

  // Check required fields
  return typeof company.name === "string" && typeof company.website === "string"
}

// ============================================
// Content Item Guards
// ============================================

export function isContentItem(value: unknown): value is ContentItem {
  if (!isObject(value)) return false
  const item = value as Partial<ContentItem>

  if (typeof item.skills === "string") {
    try {
      const parsed = JSON.parse(item.skills)
      if (!isStringArray(parsed)) {
        return false
      }
      ;(item as ContentItem).skills = parsed
    } catch {
      return false
    }
  }

  return (
    typeof item.id === "string" &&
    (item.parentId === undefined || item.parentId === null || typeof item.parentId === "string") &&
    typeof item.order === "number" &&
    (item.title === undefined || typeof item.title === "string") &&
    (item.role === undefined || typeof item.role === "string") &&
    (item.location === undefined || typeof item.location === "string") &&
    (item.website === undefined || typeof item.website === "string") &&
    (item.startDate === undefined || typeof item.startDate === "string") &&
    (item.endDate === undefined || item.endDate === null || typeof item.endDate === "string") &&
    (item.description === undefined || typeof item.description === "string") &&
    (item.skills === undefined || item.skills === null || isStringArray(item.skills)) &&
    isDateLike(item.createdAt) &&
    isDateLike(item.updatedAt) &&
    typeof item.createdBy === "string" &&
    typeof item.updatedBy === "string"
  )
}

// ============================================
// API Response Guards
// ============================================

/**
 * Type guard to check if API response is successful.
 * Uses discriminated union property `success`.
 */
export function isApiSuccess<T>(response: ApiResponse<T>): response is ApiSuccessResponse<T> {
  return response.success === true
}

/**
 * Type guard to check if API response is an error.
 */
export function isApiError<T>(response: ApiResponse<T>): response is ApiErrorResponse {
  return response.success === false
}

/**
 * Type guard to validate the general ApiResponse structure.
 */
export function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  if (!isObject(value)) {
    return false
  }

  const obj = value as Record<string, unknown>
  const success = obj.success

  if (typeof success !== "boolean") {
    return false
  }

  if (success === true) {
    return Object.prototype.hasOwnProperty.call(obj, "data")
  }

  if (!isObject(obj.error)) {
    return false
  }

  const error = obj.error as Record<string, unknown>
  return typeof error.code === "string" && typeof error.message === "string"
}

/**
 * Type guard to check if an API error carries a specific error code.
 */
export function hasErrorCode(response: ApiErrorResponse, code: string): boolean {
  return response.error.code === code
}

/**
 * Type guard to check if value is a Date object.
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

/**
 * Type guard to confirm value is an ISO 8601 date string.
 */
export function isISODateString(value: unknown): value is string {
  if (typeof value !== "string") {
    return false
  }

  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.toISOString() === value
}

/**
 * Type guard to ensure value is a non-empty string.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

/**
 * Type guard to ensure value is a non-empty array.
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return Array.isArray(value) && value.length > 0
}

/**
 * Type guard to ensure value is an HTTP/HTTPS URL string.
 */
export function isValidUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false
  }

  const urlPattern = /^(https?):\/\/./
  return urlPattern.test(value)
}

/**
 * Simple email validation guard.
 */
export function isValidEmail(value: unknown): value is string {
  if (typeof value !== "string") {
    return false
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(value)
}

/**
 * Helper to build a typed success response.
 */
export function createSuccessResponse<T>(data: T, message?: string): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
    ...(message && { message }),
  }
}

/**
 * Helper to build a typed error response.
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: Record<string, unknown>
): ApiErrorResponse {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
  }
}
