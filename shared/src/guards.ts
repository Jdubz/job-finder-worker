/**
 * Type Guard Functions
 *
 * Runtime validation helpers for shared domain types and API responses.
 * Use these guards when reading from Firestore, handling API payloads, or
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

import type {
  QueueItem,
  QueueSource,
  StopList,
  QueueSettings,
  AISettings,
  AIProvider,
} from "./queue.types"
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
  JobMatch,
  Company,
  ResumeIntakeData,
  ExperienceHighlight,
  ProjectRecommendation,
  GapMitigation,
} from "./job.types"
import type { ContentItem, ContentItemVisibility } from "./content-item.types"
import type {
  GenerationType,
  AIProviderType,
  GenerationStepStatus,
} from "./generator.types"
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
 * Helper: Check if value is a Date or Firestore Timestamp
 */
function isDateLike(value: unknown): boolean {
  if (value instanceof Date) return true
  if (!isObject(value)) return false
  // Check for Firestore Timestamp structure
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
    typeof item.url === "string" &&
    typeof item.company_name === "string" &&
    (item.company_id === null || typeof item.company_id === "string") &&
    isQueueSource(item.source) &&
    (item.submitted_by === null || typeof item.submitted_by === "string") &&
    typeof item.retry_count === "number" &&
    typeof item.max_retries === "number" &&
    isDateLike(item.created_at) &&
    isDateLike(item.updated_at)
  )
}

/**
 * Type guard for StopList
 */
export function isStopList(value: unknown): value is StopList {
  if (!isObject(value)) return false

  const stopList = value as Partial<StopList>

  return (
    isStringArray(stopList.excludedCompanies) &&
    isStringArray(stopList.excludedKeywords) &&
    isStringArray(stopList.excludedDomains)
  )
}

/**
 * Type guard for QueueSettings
 */
export function isQueueSettings(value: unknown): value is QueueSettings {
  if (!isObject(value)) return false

  const settings = value as Partial<QueueSettings>

  return (
    typeof settings.maxRetries === "number" &&
    typeof settings.retryDelaySeconds === "number" &&
    typeof settings.processingTimeout === "number"
  )
}

/**
 * Type guard for AIProvider
 */
export function isAIProvider(value: unknown): value is AIProvider {
  return typeof value === "string" && ["claude", "openai", "gemini"].includes(value)
}

/**
 * Type guard for AISettings
 */
export function isAISettings(value: unknown): value is AISettings {
  if (!isObject(value)) return false

  const settings = value as Partial<AISettings>

  return (
    isAIProvider(settings.provider) &&
    typeof settings.model === "string" &&
    typeof settings.minMatchScore === "number" &&
    typeof settings.costBudgetDaily === "number"
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

/**
 * Type guard for AIProviderType
 */
export function isAIProviderType(value: unknown): value is AIProviderType {
  return typeof value === "string" && ["openai", "gemini"].includes(value)
}

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
 * Type guard for JobMatch
 */
export function isJobMatch(value: unknown): value is JobMatch {
  if (!isObject(value)) return false

  const match = value as Partial<JobMatch>

  // Check required fields
  return (
    typeof match.url === "string" &&
    typeof match.companyName === "string" &&
    typeof match.jobTitle === "string" &&
    typeof match.jobDescription === "string" &&
    typeof match.matchScore === "number" &&
    isStringArray(match.matchedSkills) &&
    isStringArray(match.missingSkills) &&
    isStringArray(match.matchReasons) &&
    isStringArray(match.keyStrengths) &&
    isStringArray(match.potentialConcerns) &&
    typeof match.experienceMatch === "number" &&
    (match.applicationPriority === "High" ||
      match.applicationPriority === "Medium" ||
      match.applicationPriority === "Low") &&
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

export function isContentItemVisibility(value: unknown): value is ContentItemVisibility {
  return value === "published" || value === "draft" || value === "archived"
}

export function isContentItem(value: unknown): value is ContentItem {
  if (!isObject(value)) return false
  const item = value as Partial<ContentItem>
  if (typeof item.visibility !== "string" || !isContentItemVisibility(item.visibility)) {
    return false
  }

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
    typeof item.userId === "string" &&
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

// ============================================
// Firestore Schema Guards
// ============================================

// Re-export all Firestore schema guards for convenience
export {
  isQueueItemStatus as isQueueItemDocumentStatus,
  isQueueItemType as isQueueItemDocumentType,
  isQueueSource as isQueueItemDocumentSource,
  isQueueItemDocument,
  isCompanyTier,
  isCompanyDocument,
  isContentItemVisibility as isContentItemDocumentVisibility,
  isContentItemDocument,
  isContactSubmissionDocument,
  isUserDocument,
  isConfigDocument,
} from "./firestore-schema.guards"
