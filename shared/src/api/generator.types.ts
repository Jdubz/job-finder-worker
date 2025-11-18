/**
 * Generator API Types
 *
 * Type definitions for document generation API endpoints.
 * Handles resume and cover letter generation requests/responses.
 *
 * Used by job-finder-FE to call document generation Firebase Functions
 * and by job-finder-BE to implement the endpoints.
 */

import type { ApiResponse } from "../api.types"
import type { TokenUsage, GeneratorDocumentRecord } from "../generator.types"

/**
 * Generate Resume Request
 * Request payload for resume generation endpoint
 */
export interface GenerateResumeRequest {
  jobMatchId: string
  templateId?: string
  customizations?: {
    targetSummary?: string
    skillsToHighlight?: string[]
    experienceToEmphasize?: string[]
    sectionsToInclude?: string[]
  }
  options?: {
    includePhoto?: boolean
    colorScheme?: string
    format?: "pdf" | "docx"
  }
}

/**
 * Generate Resume Response
 * Response payload for successful resume generation
 */
export interface GenerateResumeResponse {
  documentId: string
  documentUrl: string
  generatedAt: string
  expiresAt?: string
  metadata: {
    wordCount: number
    sections: string[]
    templateId?: string
    fileSize?: number
    format: string
  }
  tokenUsage?: TokenUsage
  costUsd?: number
}

/**
 * Generate Cover Letter Request
 * Request payload for cover letter generation endpoint
 */
export interface GenerateCoverLetterRequest {
  jobMatchId: string
  templateId?: string
  customizations?: {
    tone?: "professional" | "enthusiastic" | "conversational"
    emphasizePoints?: string[]
    companyResearch?: string
  }
  options?: {
    format?: "pdf" | "docx"
  }
}

/**
 * Generate Cover Letter Response
 * Response payload for successful cover letter generation
 */
export interface GenerateCoverLetterResponse {
  documentId: string
  documentUrl: string
  generatedAt: string
  expiresAt?: string
  metadata: {
    wordCount: number
    paragraphs: number
    templateId?: string
    fileSize?: number
    format: string
  }
  tokenUsage?: TokenUsage
  costUsd?: number
}

/**
 * Generate Both Documents Request
 * Request payload for generating both resume and cover letter
 */
export interface GenerateBothDocumentsRequest {
  jobMatchId: string
  resumeTemplateId?: string
  coverLetterTemplateId?: string
  resumeCustomizations?: GenerateResumeRequest["customizations"]
  coverLetterCustomizations?: GenerateCoverLetterRequest["customizations"]
  options?: {
    format?: "pdf" | "docx"
  }
}

/**
 * Generate Both Documents Response
 * Response payload for successful generation of both documents
 */
export interface GenerateBothDocumentsResponse {
  resume: GenerateResumeResponse
  coverLetter: GenerateCoverLetterResponse
  generatedAt: string
  totalCostUsd?: number
  totalTokenUsage?: {
    resumeTokens: number
    coverLetterTokens: number
    totalTokens: number
  }
}

/**
 * Get Generation Status Request
 * Request payload for checking generation status
 */
export interface GetGenerationStatusRequest {
  requestId: string
}

/**
 * Get Generation Status Response
 * Response payload for generation status check
 */
export interface GetGenerationStatusResponse {
  requestId: string
  status: "pending" | "processing" | "completed" | "failed"
  progress?: {
    currentStep: string
    totalSteps: number
    completedSteps: number
  }
  result?: {
    resumeUrl?: string
    coverLetterUrl?: string
  }
  error?: {
    message: string
    code: string
  }
  createdAt: string
  updatedAt: string
}

/**
 * Regenerate Document Request
 * Request payload for regenerating a document with feedback
 */
export interface RegenerateDocumentRequest {
  documentId: string
  documentType: "resume" | "coverLetter"
  feedback?: {
    sectionsToRevise?: string[]
    additionalInstructions?: string
  }
  customizations?: GenerateResumeRequest["customizations"] | GenerateCoverLetterRequest["customizations"]
}

/**
 * Regenerate Document Response
 * Response payload for document regeneration
 */
export interface RegenerateDocumentResponse {
  documentId: string
  documentUrl: string
  regeneratedAt: string
  expiresAt?: string
  changes: {
    summary: string
    sectionsModified: string[]
  }
  tokenUsage?: TokenUsage
  costUsd?: number
}

/**
 * Type-safe API signatures for generator endpoints
 */
export type GenerateResumeApi = (
  request: GenerateResumeRequest
) => Promise<ApiResponse<GenerateResumeResponse>>

export type GenerateCoverLetterApi = (
  request: GenerateCoverLetterRequest
) => Promise<ApiResponse<GenerateCoverLetterResponse>>

export type GenerateBothDocumentsApi = (
  request: GenerateBothDocumentsRequest
) => Promise<ApiResponse<GenerateBothDocumentsResponse>>

export type GetGenerationStatusApi = (
  request: GetGenerationStatusRequest
) => Promise<ApiResponse<GetGenerationStatusResponse>>

export type RegenerateDocumentApi = (
  request: RegenerateDocumentRequest
) => Promise<ApiResponse<RegenerateDocumentResponse>>

/**
 * Generator document storage APIs (admin)
 */
export interface ListGeneratorDocumentsResponse {
  documents: GeneratorDocumentRecord[]
  count: number
}

export interface GetGeneratorDocumentResponse {
  document: GeneratorDocumentRecord
}

export interface UpsertGeneratorDocumentRequest {
  id: string
  documentType: string
  payload: Record<string, unknown>
}

export interface UpsertGeneratorDocumentResponse {
  document: GeneratorDocumentRecord
}
