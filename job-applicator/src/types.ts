/**
 * Shared types for job-applicator Electron app.
 *
 * This file consolidates all type definitions used across main.ts, preload.ts,
 * and renderer/app.ts to eliminate duplication and ensure consistency.
 */

// ============================================================================
// EEO Types (Equal Employment Opportunity)
// ============================================================================

export interface EEOInfo {
  race?: string
  hispanicLatino?: string
  gender?: string
  veteranStatus?: string
  disabilityStatus?: string
}

// ============================================================================
// Personal & Content Types
// ============================================================================

export interface PersonalInfo {
  name: string
  email: string
  phone?: string
  location?: string
  website?: string
  github?: string
  linkedin?: string
  summary?: string
  eeo?: EEOInfo
}

export interface ContentItem {
  id: string
  title?: string
  role?: string
  location?: string
  startDate?: string
  endDate?: string
  description?: string
  skills?: string[]
  children?: ContentItem[]
}

// ============================================================================
// Form Types
// ============================================================================

export interface SelectOption {
  value: string
  text: string
}

export interface FormField {
  selector: string | null
  type: string
  label: string | null
  placeholder: string | null
  required: boolean
  options: SelectOption[] | null
}

export interface FillInstruction {
  selector: string
  value: string
}

export interface EnhancedFillInstruction {
  selector: string
  value: string | null
  status: "filled" | "skipped"
  reason?: string
  label?: string
}

export interface FormFillSummary {
  totalFields: number
  filledCount: number
  skippedCount: number
  skippedFields: Array<{ label: string; reason: string }>
  duration: number
}

// ============================================================================
// Job Types
// ============================================================================

export interface JobExtraction {
  title: string | null
  description: string | null
  location: string | null
  techStack: string | null
  companyName: string | null
}

export interface JobMatchListItem {
  id: string
  matchScore: number
  status: "active" | "ignored" | "applied"
  listing: {
    id: string
    url: string
    title: string
    companyName: string
    location?: string
  }
}

// ============================================================================
// Document Types
// ============================================================================

export interface DocumentInfo {
  id: string
  generateType: "resume" | "coverLetter" | "both"
  status: "pending" | "processing" | "completed" | "failed"
  resumeUrl?: string
  coverLetterUrl?: string
  createdAt: string
  jobMatchId?: string
}

export interface GenerationStep {
  id: string
  name: string
  description: string
  status: "pending" | "in_progress" | "completed" | "failed" | "skipped"
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

export interface GenerationProgress {
  requestId: string
  status: string
  steps: GenerationStep[]
  currentStep?: string
  resumeUrl?: string
  coverLetterUrl?: string
  error?: string
}

// ============================================================================
// CLI Types
// ============================================================================

export type CliProvider = "claude" | "codex" | "gemini"

// ============================================================================
// Workflow Types
// ============================================================================

export type WorkflowStep = "job" | "docs" | "fill" | "submit"

export interface WorkflowState {
  job: "pending" | "active" | "completed"
  docs: "pending" | "active" | "completed"
  fill: "pending" | "active" | "completed"
  submit: "pending" | "active" | "completed"
}
