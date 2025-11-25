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
  }
  preferences?: {
    style?: "modern" | "traditional" | "technical" | "executive"
    emphasize?: string[]
  }
  date?: string // Client's local date string for cover letter
  jobMatchId?: string // Reference to job-match document ID
}

export interface GenerateDocumentResponse {
  success: boolean
  message: string
  documentUrl?: string
  documentId?: string
  generationId?: string
  error?: string
}

export interface DocumentHistoryItem {
  id: string
  type: "resume" | "cover_letter"
  jobTitle: string
  companyName: string
  documentUrl: string
  createdAt: Date
  jobMatchId?: string
}

export interface UserDefaults {
  name: string
  email: string
  phone?: string
  location?: string
  linkedin?: string
  github?: string
  portfolio?: string
  summary?: string
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
  }
  requestId: string
}

export class GeneratorClient extends BaseApiClient {
  constructor(baseUrl: string | (() => string) = () => API_CONFIG.generatorBaseUrl) {
    // Use longer timeout for AI generation (2 minutes) and fewer retries
    // since generation steps are not idempotent
    super(baseUrl, { timeout: 120000, retryAttempts: 1 })
  }

  /**
   * Generate a resume or cover letter
   */
  async generateDocument(request: GenerateDocumentRequest): Promise<GenerateDocumentResponse> {
    return this.post<GenerateDocumentResponse>("/generate", request)
  }

  /**
   * Get document generation history
   */
  async getHistory(): Promise<DocumentHistoryItem[]> {
    type HistoryResponse = { requests: DocumentHistoryItem[]; count: number }
    const response = await this.get<HistoryResponse | ApiEnvelope<HistoryResponse>>(`/requests`)
    const data = unwrapResponse(response)
    return data.requests ?? []
  }

  /**
   * Get user's default settings
   */
  async getUserDefaults(): Promise<UserDefaults> {
    const response = await this.get<UserDefaults | ApiEnvelope<UserDefaults>>("/defaults")
    return unwrapResponse(response)
  }

  /**
   * Update user's default settings
   */
  async updateUserDefaults(defaults: Partial<UserDefaults>): Promise<{ success: boolean }> {
    return this.put<{ success: boolean }>("/defaults", defaults)
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
}

// Export singleton instance
export const generatorClient = new GeneratorClient()
