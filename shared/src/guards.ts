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
import type {
  ContentItem,
  ContentItemType,
  ContentItemVisibility,
  CompanyItem,
  ProjectItem,
  SkillGroupItem,
  EducationItem,
  ProfileSectionItem,
  AccomplishmentItem,
} from "./content-item.types"
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
// Content Item Types Guards
// ============================================

/**
 * Type guard for ContentItemType
 */
export function isContentItemType(value: unknown): value is ContentItemType {
  return (
    typeof value === "string" &&
    [
      "company",
      "project",
      "skill-group",
      "education",
      "profile-section",
      "accomplishment",
    ].includes(value)
  )
}

/**
 * Type guard for ContentItemVisibility
 */
export function isContentItemVisibility(value: unknown): value is ContentItemVisibility {
  return typeof value === "string" && ["published", "draft", "archived"].includes(value)
}

/**
 * Type guard for base ContentItem fields (used by specific type guards)
 */
function hasBaseContentItemFields(value: Record<string, unknown>): boolean {
  // Validate optional visibility field if present
  if (value.visibility !== undefined && !isContentItemVisibility(value.visibility)) {
    return false
  }

  // Validate optional tags field if present
  if (value.tags !== undefined && !isStringArray(value.tags)) {
    return false
  }

  // Validate optional aiContext field if present
  if (value.aiContext !== undefined) {
    if (!isObject(value.aiContext)) return false
    const aiContext = value.aiContext as Record<string, unknown>
    if (aiContext.emphasize !== undefined && typeof aiContext.emphasize !== "boolean") {
      return false
    }
    if (aiContext.omitFromResume !== undefined && typeof aiContext.omitFromResume !== "boolean") {
      return false
    }
    if (aiContext.keywords !== undefined && !isStringArray(aiContext.keywords)) {
      return false
    }
  }

  return (
    typeof value.id === "string" &&
    isContentItemType(value.type) &&
    typeof value.userId === "string" &&
    (value.parentId === null || typeof value.parentId === "string") &&
    typeof value.order === "number" &&
    isDateLike(value.createdAt) &&
    isDateLike(value.updatedAt) &&
    typeof value.createdBy === "string" &&
    typeof value.updatedBy === "string"
  )
}

/**
 * Type guard for CompanyItem
 */
export function isCompanyItem(value: unknown): value is CompanyItem {
  if (!isObject(value)) return false
  if (!hasBaseContentItemFields(value)) return false

  const item = value as Partial<CompanyItem>

  // Validate optional fields if present
  if (item.role !== undefined && typeof item.role !== "string") return false
  if (item.location !== undefined && typeof item.location !== "string") return false
  if (item.website !== undefined && typeof item.website !== "string") return false
  if (item.endDate !== undefined && item.endDate !== null && typeof item.endDate !== "string") return false
  if (item.summary !== undefined && typeof item.summary !== "string") return false
  if (item.accomplishments !== undefined && !isStringArray(item.accomplishments)) return false
  if (item.technologies !== undefined && !isStringArray(item.technologies)) return false
  if (item.notes !== undefined && typeof item.notes !== "string") return false

  return (
    item.type === "company" &&
    typeof item.company === "string" &&
    typeof item.startDate === "string"
  )
}

/**
 * Type guard for ProjectItem
 */
export function isProjectItem(value: unknown): value is ProjectItem {
  if (!isObject(value)) return false
  if (!hasBaseContentItemFields(value)) return false

  const item = value as Partial<ProjectItem>

  // Validate optional fields if present
  if (item.role !== undefined && typeof item.role !== "string") return false
  if (item.startDate !== undefined && typeof item.startDate !== "string") return false
  if (item.endDate !== undefined && item.endDate !== null && typeof item.endDate !== "string") return false
  if (item.accomplishments !== undefined && !isStringArray(item.accomplishments)) return false
  if (item.technologies !== undefined && !isStringArray(item.technologies)) return false
  if (item.challenges !== undefined && !isStringArray(item.challenges)) return false
  if (item.context !== undefined && typeof item.context !== "string") return false
  if (item.links !== undefined) {
    if (!Array.isArray(item.links)) return false
    for (const link of item.links) {
      if (!isObject(link) || typeof link.label !== "string" || typeof link.url !== "string") {
        return false
      }
    }
  }

  return item.type === "project" && typeof item.name === "string" && typeof item.description === "string"
}

/**
 * Type guard for SkillGroupItem
 */
export function isSkillGroupItem(value: unknown): value is SkillGroupItem {
  if (!isObject(value)) return false
  if (!hasBaseContentItemFields(value)) return false

  const item = value as Partial<SkillGroupItem>

  return (
    item.type === "skill-group" &&
    typeof item.category === "string" &&
    isStringArray(item.skills)
  )
}

/**
 * Type guard for EducationItem
 */
export function isEducationItem(value: unknown): value is EducationItem {
  if (!isObject(value)) return false
  if (!hasBaseContentItemFields(value)) return false

  const item = value as Partial<EducationItem>

  // Validate optional fields if present
  if (item.degree !== undefined && typeof item.degree !== "string") return false
  if (item.field !== undefined && typeof item.field !== "string") return false
  if (item.location !== undefined && typeof item.location !== "string") return false
  if (item.startDate !== undefined && typeof item.startDate !== "string") return false
  if (item.endDate !== undefined && item.endDate !== null && typeof item.endDate !== "string") return false
  if (item.honors !== undefined && typeof item.honors !== "string") return false
  if (item.description !== undefined && typeof item.description !== "string") return false
  if (item.relevantCourses !== undefined && !isStringArray(item.relevantCourses)) return false
  if (item.credentialId !== undefined && typeof item.credentialId !== "string") return false
  if (item.credentialUrl !== undefined && typeof item.credentialUrl !== "string") return false
  if (item.expiresAt !== undefined && typeof item.expiresAt !== "string") return false

  return item.type === "education" && typeof item.institution === "string"
}

/**
 * Type guard for ProfileSectionItem
 */
export function isProfileSectionItem(value: unknown): value is ProfileSectionItem {
  if (!isObject(value)) return false
  if (!hasBaseContentItemFields(value)) return false

  const item = value as Partial<ProfileSectionItem>

  return (
    item.type === "profile-section" &&
    typeof item.heading === "string" &&
    typeof item.content === "string"
  )
}

/**
 * Type guard for AccomplishmentItem
 */
export function isAccomplishmentItem(value: unknown): value is AccomplishmentItem {
  if (!isObject(value)) return false
  if (!hasBaseContentItemFields(value)) return false

  const item = value as Partial<AccomplishmentItem>

  // Validate optional fields if present
  if (item.context !== undefined && typeof item.context !== "string") return false
  if (item.impact !== undefined && typeof item.impact !== "string") return false
  if (item.technologies !== undefined && !isStringArray(item.technologies)) return false
  if (item.date !== undefined && typeof item.date !== "string") return false

  return item.type === "accomplishment" && typeof item.description === "string"
}

/**
 * Type guard for ContentItem (union type)
 * Checks if value is any valid ContentItem type
 */
export function isContentItem(value: unknown): value is ContentItem {
  return (
    isCompanyItem(value) ||
    isProjectItem(value) ||
    isSkillGroupItem(value) ||
    isEducationItem(value) ||
    isProfileSectionItem(value) ||
    isAccomplishmentItem(value)
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
  isContentItemType as isContentItemDocumentType,
  isContentItemVisibility as isContentItemDocumentVisibility,
  isContentItemDocument,
  isContactSubmissionDocument,
  isUserDocument,
  isConfigDocument,
} from "./firestore-schema.guards"
