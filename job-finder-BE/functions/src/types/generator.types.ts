/**
 * Type definitions for the AI Resume Generator (BE-specific)
 *
 * This file contains BE-specific types only.
 * Shared types are imported from @shared/types.
 */

import type { ContentItem } from "./content-item.types"

// Import shared types from the shared-types package
import type {
  GenerationType,
  AIProviderType,
  TokenUsage,
  JobMatchData,
  GenerationStepStatus,
  GenerationStep,
  GeneratorRequest,
  GeneratorResponse,
  ResumeContent,
  CoverLetterContent,
  GenerateDocumentsRequest,
  GenerateDocumentsResponse,
  PersonalInfoDocument,
  UpdatePersonalInfoData,
} from "@shared/types"

// Re-export shared types for backward compatibility
export type {
  GenerationType,
  AIProviderType,
  TokenUsage,
  JobMatchData,
  GenerationStepStatus,
  GenerationStep,
  GeneratorRequest,
  GeneratorResponse,
  ResumeContent,
  CoverLetterContent,
  GenerateDocumentsRequest,
  GenerateDocumentsResponse,
  UpdatePersonalInfoData,
}

// Type alias for PersonalInfo (uses PersonalInfoDocument from shared-types)
export type PersonalInfo = PersonalInfoDocument

// =============================================================================
// BE-SPECIFIC TYPES BELOW
// =============================================================================

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert TimestampLike to milliseconds
 * Handles both Date objects and Firestore Timestamps
 */
export function timestampToMillis(timestamp: Date | { toMillis(): number }): number {
  if (timestamp instanceof Date) {
    return timestamp.getTime()
  }
  if (timestamp && typeof timestamp.toMillis === "function") {
    return timestamp.toMillis()
  }
  throw new Error("Invalid timestamp: must be Date or Firestore Timestamp")
}

// =============================================================================
// Logging
// =============================================================================

export interface SimpleLogger {
  info: (message: string, data?: unknown) => void
  warning: (message: string, data?: unknown) => void
  error: (message: string, data?: unknown) => void
}

// =============================================================================
// AI Provider Service Types (BE-specific)
// =============================================================================

/**
 * Result from AI resume generation (BE service result)
 */
export interface AIResumeGenerationResult {
  content: ResumeContent
  tokenUsage: TokenUsage
  model: string
}

/**
 * Result from AI cover letter generation (BE service result)
 */
export interface AICoverLetterGenerationResult {
  content: CoverLetterContent
  tokenUsage: TokenUsage
  model: string
}

/**
 * Options for generating a resume with AI (BE service options)
 */
export interface GenerateResumeOptions {
  personalInfo: {
    name: string
    email: string
    phone?: string
    location?: string
    website?: string
    github?: string
    linkedin?: string
  }
  job: {
    role: string
    company: string
    companyWebsite?: string
    jobDescription?: string
  }
  contentItems: ContentItem[] // All content items (companies, projects, skills, etc.)
  emphasize?: string[]
  jobMatchData?: JobMatchData // AI-generated insights for this specific job match
  customPrompts?: {
    systemPrompt?: string
    userPromptTemplate?: string
  }
}

/**
 * Options for generating a cover letter with AI (BE service options)
 */
export interface GenerateCoverLetterOptions {
  personalInfo: {
    name: string
    email: string
  }
  job: {
    role: string
    company: string
    companyWebsite?: string
    jobDescription?: string
  }
  contentItems: ContentItem[] // All content items (companies, projects, skills, etc.)
  jobMatchData?: JobMatchData // AI-generated insights for this specific job match
  customPrompts?: {
    systemPrompt?: string
    userPromptTemplate?: string
  }
}

/**
 * AI Provider Interface (BE service abstraction)
 *
 * Abstracts the AI provider (OpenAI, Gemini, etc.) to enable:
 * - Cost optimization (switch to cheaper provider)
 * - Vendor flexibility (not locked to single provider)
 * - Quality comparison (A/B test providers)
 * - Fallback options (if one provider has issues)
 */
export interface AIProvider {
  /**
   * Generate resume content using AI
   */
  generateResume(options: GenerateResumeOptions): Promise<AIResumeGenerationResult>

  /**
   * Generate cover letter content using AI
   */
  generateCoverLetter(options: GenerateCoverLetterOptions): Promise<AICoverLetterGenerationResult>

  /**
   * Calculate cost in USD from token usage
   */
  calculateCost(tokenUsage: TokenUsage): number

  /**
   * Get the model name/identifier
   */
  readonly model: string

  /**
   * Get the provider type
   */
  readonly providerType: AIProviderType

  /**
   * Get pricing information (per 1M tokens)
   */
  readonly pricing: {
    inputCostPer1M: number
    outputCostPer1M: number
  }
}

// =============================================================================
// Helper Types for BE-specific operations
// =============================================================================

/**
 * Data for creating a generator request (BE-specific)
 */
export interface CreateGeneratorRequestData {
  generateType: GenerationType
  provider?: AIProviderType // Optional, defaults to 'openai' if not provided
  job: {
    role: string
    company: string
    companyWebsite?: string
    jobDescriptionUrl?: string
    jobDescriptionText?: string
  }
  preferences?: {
    style?: string
    emphasize?: string[]
  }
}
