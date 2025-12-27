/**
 * Generator API Client
 *
 * Handles AI resume and cover letter generation.
 * Integrates with the Node API proxy for document generation.
 */

import { BaseApiClient } from "./base-client"
import { API_CONFIG } from "@/config/api"

type ApiEnvelope<T> = { success: boolean; data: T }

function unwrapResponse<T>(payload: T | ApiEnvelope<T>): T {
  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    "data" in payload &&
    typeof (payload as ApiEnvelope<T>).success === "boolean"
  ) {
    return (payload as ApiEnvelope<T>).data
  }
  return payload as T
}

/**
 * Request payload for generating documents
 * IMPORTANT: Must match the backend schema in generator.ts (generateRequestSchema)
 *
 * The backend fetches personal info, experiences, and blurbs from SQLite automatically.
 * The frontend only needs to provide job details and preferences.
 */
export interface GenerateDocumentRequest {
  generateType: "resume" | "coverLetter" | "both"
  provider?: "openai" | "gemini"
  job: {
    role: string
    company: string
    companyWebsite?: string
    jobDescriptionUrl?: string
    jobDescriptionText?: string
    location?: string
  }
  preferences?: {
    style?: "modern" | "traditional" | "technical" | "executive"
    emphasize?: string[]
  }
  date?: string // Client's local date string for cover letter
  jobMatchId?: string // Reference to job-match document ID
}

export interface GeneratorArtifact {
  id: string
  requestId: string
  artifactType: string
  filename: string
  storagePath: string
  sizeBytes?: number | null
  createdAt: string
}

export interface GeneratorRequestRecord {
  id: string
  generateType: "resume" | "coverLetter" | "both"
  job: {
    role: string
    company: string
    companyWebsite?: string
    jobDescriptionUrl?: string
    jobDescriptionText?: string
  }
  preferences?: Record<string, unknown> | null
  personalInfo?: Record<string, unknown> | null
  status: "pending" | "processing" | "awaiting_review" | "completed" | "failed"
  resumeUrl?: string | null
  coverLetterUrl?: string | null
  jobMatchId?: string | null
  createdBy?: string | null
  steps?: GenerationStep[] | null
  createdAt: string
  updatedAt: string
  artifacts: GeneratorArtifact[]
}

export interface GenerationStep {
  id: string
  name: string
  description: string
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped"
  startedAt?: Date
  completedAt?: Date
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

export interface StartGenerationResponse {
  success: boolean
  data: {
    requestId: string
    status: string
    nextStep?: string
    steps?: GenerationStep[]
    stepCompleted?: string
    resumeUrl?: string
    coverLetterUrl?: string
  }
  requestId: string
  /** Error message when success is false */
  error?: string
}

export interface ExecuteStepResponse {
  success: boolean
  data: {
    requestId: string
    stepCompleted?: string
    nextStep?: string
    status: string
    resumeUrl?: string
    coverLetterUrl?: string
    steps?: GenerationStep[]
    error?: string
  }
  requestId: string
}

export type ReviewDocumentType = "resume" | "coverLetter"

export interface DraftContentResponse {
  requestId: string
  documentType: ReviewDocumentType
  content: ResumeContent | CoverLetterContent
  status: "awaiting_review"
}

export interface ResumeContent {
  personalInfo?: {
    name: string
    title?: string
    summary?: string
    contact?: {
      email?: string
      location?: string
      website?: string
      linkedin?: string
      github?: string
    }
  }
  professionalSummary?: string
  experience?: Array<{
    role: string
    company: string
    location?: string
    startDate?: string
    endDate?: string
    highlights?: string[]
    technologies?: string[]
  }>
  skills?: Array<{
    category: string
    items: string[]
  }>
  education?: Array<{
    institution: string
    degree?: string
    field?: string
    startDate?: string
    endDate?: string
  }>
}

export interface CoverLetterContent {
  recipientName?: string
  recipientTitle?: string
  companyName: string
  openingParagraph: string
  bodyParagraphs: string[]
  closingParagraph: string
  signature?: string
}

export interface SubmitReviewRequest {
  documentType: ReviewDocumentType
  content: ResumeContent | CoverLetterContent
}

export class GeneratorClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.generatorBaseUrl) {
    // Use longer timeout for AI generation (2 minutes) and fewer retries
    // since generation steps are not idempotent
    super(baseUrl, { timeout: 120000, retryAttempts: 1 })
  }

  /**
   * List document generation history
   */
  async listDocuments(filters?: { jobMatchId?: string }): Promise<GeneratorRequestRecord[]> {
    type HistoryResponse = { requests: GeneratorRequestRecord[]; count: number }
    const query = filters?.jobMatchId ? `?jobMatchId=${filters.jobMatchId}` : ""
    const response = await this.get<HistoryResponse | ApiEnvelope<HistoryResponse>>(`/requests${query}`)
    const data = unwrapResponse(response)
    return data.requests ?? []
  }

  async listDocumentsForMatch(matchId: string): Promise<GeneratorRequestRecord[]> {
    type HistoryResponse = { requests: GeneratorRequestRecord[]; count: number }
    const response = await this.get<HistoryResponse | ApiEnvelope<HistoryResponse>>(
      `/job-matches/${matchId}/documents`
    )
    const data = unwrapResponse(response)
    return data.requests ?? []
  }

  async uploadAsset(params: { type: "avatar" | "logo"; dataUrl: string }): Promise<{ path: string; publicUrl: string }> {
    return this.post<{ success: boolean; path: string; publicUrl: string }>("/assets/upload", params).then((r) => ({
      path: r.path,
      publicUrl: r.publicUrl,
    }))
  }

  /**
   * Delete a document from history
   */
  async deleteDocument(documentId: string): Promise<{ success: boolean }> {
    return this.delete<{ success: boolean }>(`/requests/${documentId}`)
  }

  /**
   * Start multi-step document generation
   * Returns requestId to track progress through steps
   */
  async startGeneration(request: GenerateDocumentRequest): Promise<StartGenerationResponse> {
    return this.post<StartGenerationResponse>("/start", request)
  }

  /**
   * Execute the next step in a multi-step generation
   * Call repeatedly until nextStep is null
   */
  async executeStep(requestId: string): Promise<ExecuteStepResponse> {
    return this.post<ExecuteStepResponse>(`/step/${requestId}`, {})
  }

  /**
   * Get draft content awaiting review
   * Returns null if no content is awaiting review
   */
  async getDraftContent(requestId: string): Promise<DraftContentResponse | null> {
    try {
      const response = await this.get<{ success: boolean; data: DraftContentResponse }>(`/requests/${requestId}/draft`)
      return response.data
    } catch {
      return null
    }
  }

  /**
   * Submit reviewed/edited content to continue generation
   */
  async submitReview(requestId: string, request: SubmitReviewRequest): Promise<ExecuteStepResponse> {
    return this.post<ExecuteStepResponse>(`/requests/${requestId}/submit-review`, request)
  }
}

// Export singleton instance
export const generatorClient = new GeneratorClient()
