/**
 * Generator Types
 *
 * Type definitions for AI-powered resume and cover letter generation.
 * Used by both job-finder-BE (Cloud Functions) and job-finder-FE.
 *
 * Provider configuration is handled by LiteLLM proxy.
 */

import type { TimestampLike } from "./time.types"
import type { AIProviderType } from "./config.types"

// Re-export for backwards compatibility in generator contexts
export type { AIProviderType } from "./config.types"

/**
 * Generation type - what to generate
 */
export type GenerationType = "resume" | "coverLetter" | "both"

/**
 * Token usage tracking for AI generation
 */
export interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/**
 * EEO (Equal Employment Opportunity) Race Categories
 * Based on official EEOC categories for US employment applications
 */
export type EEORace =
  | "american_indian_alaska_native"
  | "asian"
  | "black_african_american"
  | "native_hawaiian_pacific_islander"
  | "white"
  | "two_or_more_races"
  | "decline_to_identify"

/**
 * EEO Hispanic/Latino ethnicity
 */
export type EEOHispanicLatino = "yes" | "no" | "decline_to_identify"

/**
 * EEO Gender categories
 */
export type EEOGender = "male" | "female" | "decline_to_identify"

/**
 * EEO Veteran Status categories
 */
export type EEOVeteranStatus =
  | "not_protected_veteran"
  | "protected_veteran"
  | "disabled_veteran"
  | "decline_to_identify"

/**
 * EEO Disability Status
 */
export type EEODisabilityStatus = "yes" | "no" | "decline_to_identify"

/**
 * EEO Information for job applications
 * All fields are optional as users may choose not to disclose
 */
export interface EEOInfo {
  race?: EEORace
  hispanicLatino?: EEOHispanicLatino
  gender?: EEOGender
  veteranStatus?: EEOVeteranStatus
  disabilityStatus?: EEODisabilityStatus
}

/**
 * Personal information for document generation
 */
export interface PersonalInfo {
  name: string
  email: string
  title?: string
  /**
   * City name only (e.g., "Portland"); used for onsite/hybrid checks.
   */
  city?: string
  /**
   * Timezone offset from UTC in hours (e.g., -8 for PST).
   */
  timezone?: number | null
  relocationAllowed?: boolean
  phone?: string
  location?: string
  website?: string
  github?: string
  linkedin?: string
  summary?: string
  avatar?: string
  logo?: string
  accentColor?: string
  /**
   * Free-form (markdown ok) application info (EEO, disclosures, work authorization, etc.).
   * This is the only supported way to store EEO/application details.
   */
  applicationInfo: string
}

/**
 * Job information for tailored generation
 */
export interface JobInfo {
  role: string
  company: string
  companyWebsite?: string
  jobDescriptionUrl?: string
  jobDescriptionText?: string
}

// Experience entries removed - use ContentItem type from content-item.types.ts instead

/**
 * Job match data for AI prompt customization
 * Provides context about how well the candidate matches the job
 */
export interface JobMatchData {
  matchScore?: number
  matchedSkills?: string[]
  missingSkills?: string[]
  keyStrengths?: string[]
  potentialConcerns?: string[]
  keywords?: string[]
  customizationRecommendations?: {
    skills_to_emphasize?: string[]
    resume_focus?: string[]
    cover_letter_points?: string[]
  }
  resumeIntakeData?: {
    target_summary?: string
    skills_priority?: string[]
    keywords_to_include?: string[]
    achievement_angles?: string[]
  }
}

/**
 * Resume content structure (OpenAI structured output)
 */
export interface ResumeContent {
  personalInfo: {
    name: string
    title: string
    summary: string
    contact: {
      email: string
      location?: string
      website?: string
      linkedin?: string
      github?: string
    }
  }
  professionalSummary: string
  experience: Array<{
    company: string
    role: string
    location?: string
    startDate: string
    endDate: string | null
    highlights: string[]
    technologies?: string[]
  }>
  projects?: Array<{
    name: string
    description: string
    highlights?: string[]
    technologies?: string[]
    link?: string
  }>
  skills?: Array<{
    category: string
    items: string[]
  }>
  education?: Array<{
    institution: string
    degree: string
    field?: string
    startDate?: string
    endDate?: string
  }>
}

/**
 * Cover letter content structure (OpenAI structured output)
 */
export interface CoverLetterContent {
  greeting: string
  openingParagraph: string
  bodyParagraphs: string[]
  closingParagraph: string
  /** Closing phrase only (e.g., "Best," or "Sincerely,"). Candidate name is added programmatically. */
  signature: string
}

/**
 * Generation step status
 */
export type GenerationStepStatus = "pending" | "in_progress" | "completed" | "failed" | "skipped"

/**
 * Individual generation step tracking
 */
export interface GenerationStep {
  id: string
  name: string
  description: string
  status: GenerationStepStatus
  startedAt?: TimestampLike
  completedAt?: TimestampLike
  duration?: number
  result?: {
    resumeUrl?: string
    coverLetterUrl?: string
    [key: string]: unknown
  }
  error?: {
    message: string
    code?: string
  }
}

/**
 * Generator request document (stored in the primary database)
 */
export interface GeneratorRequest {
  id: string
  type: "request"
  generateType: GenerationType
  provider: AIProviderType
  personalInfo: PersonalInfo & {
    accentColor: string // Required for PDF generation
  }
  job: JobInfo
  jobMatchId?: string
  preferences?: {
    emphasize?: string[]
  }
  contentData?: {
    items: unknown[] // ContentItem[] - using unknown to avoid circular dependency
  }
  status: "pending" | "processing" | "awaiting_review" | "completed" | "failed"
  steps?: GenerationStep[]
  intermediateResults?: {
    resumeContent?: ResumeContent
    coverLetterContent?: CoverLetterContent
    resumeTokenUsage?: TokenUsage
    coverLetterTokenUsage?: TokenUsage
    model?: string
  }
  access: {
    viewerSessionId?: string
    isPublic: boolean
  }
  createdAt: TimestampLike
  createdBy: string | null
}

/**
 * Generator response document (stored in the primary database)
 */
export interface GeneratorResponse {
  id: string
  type: "response"
  requestId: string
  result: {
    success: boolean
    resume?: ResumeContent
    coverLetter?: CoverLetterContent
    error?: {
      message: string
      code?: string
      stage?:
        | "fetch_defaults"
        | "fetch_experience"
        | "ai_resume"
        | "ai_cover_letter"
        | "ai_generation"
        | "pdf_generation"
        | "gcs_upload"
      details?: unknown
    }
  }
  files?: {
    resume?: {
      gcsPath: string
      signedUrl?: string
  signedUrlExpiry?: TimestampLike
      size?: number
      storageClass?: "STANDARD" | "COLDLINE"
    }
    coverLetter?: {
      gcsPath: string
      signedUrl?: string
  signedUrlExpiry?: TimestampLike
      size?: number
      storageClass?: "STANDARD" | "COLDLINE"
    }
  }
  metrics: {
    durationMs: number
    tokenUsage?: {
      resumePrompt?: number
      resumeCompletion?: number
      coverLetterPrompt?: number
      coverLetterCompletion?: number
      total: number
    }
    costUsd?: number
    model: string
  }
  createdAt: TimestampLike
  updatedAt?: TimestampLike
}

/**
 * Request payload from frontend - Create generation request
 */
export interface GenerateDocumentsRequest {
  generateType: GenerationType
  provider?: AIProviderType
  job: {
    role: string
    company: string
    companyWebsite?: string
    jobDescriptionUrl?: string
    jobDescriptionText?: string
    location?: string
  }
  preferences?: {
    style?: string
    emphasize?: string[]
  }
}

/**
 * Response payload to frontend - Generation result
 */
export interface GenerateDocumentsResponse {
  requestId: string
  responseId: string
  success: boolean
  resumeUrl?: string
  coverLetterUrl?: string
  metadata: {
    generatedAt: string
    role: string
    company: string
    generateType: GenerationType
    tokenUsage?: {
      total: number
    }
    costUsd?: number
    model: string
    durationMs: number
  }
  error?: {
    message: string
    code?: string
    stage?: string
  }
}

/**
 * Personal info document (stored in job_finder_config table)
 * Contains only user contact information and presentation preferences.
 * AI prompts are stored separately in the ai-prompts config entry.
 */
export interface PersonalInfoDocument {
  id: "personal-info"
  type: "personal-info"
  name: string
  email: string
  phone?: string
  location?: string
  website?: string
  github?: string
  linkedin?: string
  avatar?: string
  logo?: string
  accentColor: string
  createdAt: TimestampLike
  updatedAt: TimestampLike
  updatedBy?: string
}

/**
 * Update payload for personal info
 */
export interface UpdatePersonalInfoData {
  name?: string
  email?: string
  phone?: string
  location?: string
  website?: string
  github?: string
  linkedin?: string
  avatar?: string
  logo?: string
  accentColor?: string
}

/**
 * Generator document (simplified request record for job-applicator)
 * Represents a generated document with its URLs and status
 */
export interface GeneratorDocument {
  id: string
  generateType: GenerationType
  status: "pending" | "processing" | "awaiting_review" | "completed" | "failed"
  resumeUrl?: string | null
  coverLetterUrl?: string | null
  jobMatchId?: string | null
  createdAt: TimestampLike
  updatedAt?: TimestampLike
}

/**
 * Response for GET /generator/job-matches/:id/documents
 */
export interface GeneratorDocumentsResponse {
  requests: GeneratorDocument[]
  count: number
}

/**
 * Response for GET /generator/requests/:id
 */
export interface GeneratorSingleDocumentResponse {
  request: GeneratorDocument
}

/**
 * Document type for review flow
 */
export type ReviewDocumentType = "resume" | "coverLetter"

/**
 * Response for GET /generator/requests/:id/draft
 * Returns draft content awaiting user review
 */
export interface DraftContentResponse {
  requestId: string
  documentType: ReviewDocumentType
  content: ResumeContent | CoverLetterContent
  status: "awaiting_review"
}

/**
 * Request body for POST /generator/requests/:id/submit-review
 * Submits edited content to continue document generation
 */
export interface SubmitReviewRequest {
  documentType: ReviewDocumentType
  content: ResumeContent | CoverLetterContent
}
