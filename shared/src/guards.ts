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

import type {
  QueueItem,
  QueueSource,
  StopList,
  QueueSettings,
  AISettings,
} from "./queue.types"
import type {
  JobFiltersConfig,
  TechnologyRanksConfig,
  SchedulerSettings,
  JobMatchConfig,
  AIProviderType,
  AIInterfaceType,
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
    typeof item.url === "string" &&
    typeof item.company_name === "string" &&
    (item.company_id === null || typeof item.company_id === "string") &&
    isQueueSource(item.source) &&
    (item.submitted_by === null || typeof item.submitted_by === "string") &&
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
    typeof settings.processingTimeoutSeconds === "number"
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

  for (const provider of settings.options) {
    if (
      !isObject(provider) ||
      !isAIProviderType((provider as any).value) ||
      !Array.isArray((provider as any).interfaces)
    ) {
      return false
    }

    for (const iface of (provider as any).interfaces) {
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
  const hasValidCombination = (sel: any) =>
    settings.options!.some(
      (provider) =>
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
 * Type guard for JobMatchConfig
 */
export function isJobMatchConfig(value: unknown): value is JobMatchConfig {
  if (!isObject(value)) return false

  const config = value as Partial<JobMatchConfig>

  return (
    typeof config.minMatchScore === "number" &&
    typeof config.portlandOfficeBonus === "number" &&
    typeof config.userTimezone === "number" &&
    typeof config.preferLargeCompanies === "boolean" &&
    typeof config.generateIntakeData === "boolean"
  )
}

export function isJobFiltersConfig(value: unknown): value is JobFiltersConfig {
  if (!isObject(value)) return false
  const v = value as Partial<JobFiltersConfig>
  return (
    typeof v.enabled === "boolean" &&
    typeof v.strikeThreshold === "number" &&
    isObject(v.hardRejections) &&
    (v.hardRejections.excludedJobTypes === undefined || isStringArray(v.hardRejections.excludedJobTypes)) &&
    (v.hardRejections.excludedSeniority === undefined || isStringArray(v.hardRejections.excludedSeniority)) &&
    (v.hardRejections.excludedCompanies === undefined || isStringArray(v.hardRejections.excludedCompanies)) &&
    (v.hardRejections.excludedKeywords === undefined || isStringArray(v.hardRejections.excludedKeywords)) &&
    (v.hardRejections.minSalaryFloor === undefined || typeof v.hardRejections.minSalaryFloor === "number") &&
    (v.hardRejections.rejectCommissionOnly === undefined || typeof v.hardRejections.rejectCommissionOnly === "boolean") &&
    isObject(v.remotePolicy) &&
    (v.remotePolicy.allowRemote === undefined || typeof v.remotePolicy.allowRemote === "boolean") &&
    (v.remotePolicy.allowHybridPortland === undefined || typeof v.remotePolicy.allowHybridPortland === "boolean") &&
    (v.remotePolicy.allowOnsite === undefined || typeof v.remotePolicy.allowOnsite === "boolean") &&
    isObject(v.salaryStrike) &&
    (v.salaryStrike.enabled === undefined || typeof v.salaryStrike.enabled === "boolean") &&
    (v.salaryStrike.threshold === undefined || typeof v.salaryStrike.threshold === "number") &&
    (v.salaryStrike.points === undefined || typeof v.salaryStrike.points === "number") &&
    isObject(v.experienceStrike) &&
    (v.experienceStrike.enabled === undefined || typeof v.experienceStrike.enabled === "boolean") &&
    (v.experienceStrike.minPreferred === undefined || typeof v.experienceStrike.minPreferred === "number") &&
    (v.experienceStrike.points === undefined || typeof v.experienceStrike.points === "number") &&
    (v.seniorityStrikes === undefined || isObject(v.seniorityStrikes)) &&
    isObject(v.qualityStrikes) &&
    (v.qualityStrikes.minDescriptionLength === undefined || typeof v.qualityStrikes.minDescriptionLength === "number") &&
    (v.qualityStrikes.shortDescriptionPoints === undefined || typeof v.qualityStrikes.shortDescriptionPoints === "number") &&
    (v.qualityStrikes.buzzwords === undefined || isStringArray(v.qualityStrikes.buzzwords)) &&
    (v.qualityStrikes.buzzwordPoints === undefined || typeof v.qualityStrikes.buzzwordPoints === "number") &&
    isObject(v.ageStrike) &&
    (v.ageStrike.enabled === undefined || typeof v.ageStrike.enabled === "boolean") &&
    (v.ageStrike.strikeDays === undefined || typeof v.ageStrike.strikeDays === "number") &&
    (v.ageStrike.rejectDays === undefined || typeof v.ageStrike.rejectDays === "number") &&
    (v.ageStrike.points === undefined || typeof v.ageStrike.points === "number")
  )
}

export function isTechnologyRanksConfig(value: unknown): value is TechnologyRanksConfig {
  if (!isObject(value)) return false
  const v = value as Partial<TechnologyRanksConfig>

  const isTechEntry = (entry: unknown): boolean => {
    if (!isObject(entry)) return false
    const e = entry as Record<string, unknown>
    return (
      typeof e.rank === "string" &&
      ["required", "ok", "strike", "fail"].includes(e.rank) &&
      (e.points === undefined || typeof e.points === "number") &&
      (e.mentions === undefined || typeof e.mentions === "number")
    )
  }

  const technologiesValid =
    isObject(v.technologies) && Object.values(v.technologies ?? {}).every(isTechEntry)

  const strikesValid =
    v.strikes === undefined ||
    (isObject(v.strikes) &&
      (v.strikes.missingAllRequired === undefined ||
        typeof v.strikes.missingAllRequired === "number") &&
      (v.strikes.perBadTech === undefined || typeof v.strikes.perBadTech === "number"))

  return technologiesValid && strikesValid
}

export function isSchedulerSettings(value: unknown): value is SchedulerSettings {
  return isObject(value) && typeof (value as Partial<SchedulerSettings>).pollIntervalSeconds === "number"
}

export function isPersonalInfo(value: unknown): value is PersonalInfo {
  if (!isObject(value)) return false
  const v = value as Partial<PersonalInfo>
  return typeof v.name === "string" && typeof v.email === "string"
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
