/**
 * Shared types for job-applicator Electron app.
 *
 * This file re-exports types from @shared/types where available and defines
 * app-specific types that are unique to the job-applicator.
 */

import type { ContentItemNode as SharedContentItemNode } from "@shared/types"

// ============================================================================
// Re-exports from @shared/types
// ============================================================================

// Personal & Content Types from shared
export type {
  EEOInfo,
  PersonalInfo,
  GenerationStep,
  GenerationType,
  GenerationStepStatus,
  ContentItemNode,
} from "@shared/types"

// Job types from shared
export type { JobMatchWithListing } from "@shared/types"

// API response types from shared
export type {
  ApiSuccessResponse,
  ApiErrorResponse,
  ApiResponse,
  GetConfigEntryResponse,
  ListJobMatchesResponse,
  GetJobMatchResponse,
  ListContentItemsResponse,
} from "@shared/types"

/**
 * Simplified ContentItem for form filling prompts.
 * Uses Pick<> from shared ContentItemNode to ensure type alignment.
 * Includes children for recursive structure needed in prompts.
 */
export type ContentItem = Pick<
  SharedContentItemNode,
  "id" | "title" | "role" | "location" | "startDate" | "endDate" | "description" | "skills"
> & {
  children?: ContentItem[]
}

// ============================================================================
// App-Specific Types (not in shared)
// ============================================================================

/**
 * Simplified job match for list display in sidebar
 */
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
// Form Types (app-specific)
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
// Job Extraction Types (app-specific)
// ============================================================================

export interface JobExtraction {
  title: string | null
  description: string | null
  location: string | null
  techStack: string | null
  companyName: string | null
}

// ============================================================================
// Document Types (app-specific UI types)
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

export interface GenerationProgress {
  requestId: string
  status: string
  steps: import("@shared/types").GenerationStep[]
  currentStep?: string
  resumeUrl?: string
  coverLetterUrl?: string
  error?: string
}

// ============================================================================
// CLI Types (app-specific)
// ============================================================================

export type CliProvider = "claude" | "codex" | "gemini"

// ============================================================================
// Workflow Types (app-specific)
// ============================================================================

export type WorkflowStep = "job" | "docs" | "fill" | "submit"

export interface WorkflowState {
  job: "pending" | "active" | "completed"
  docs: "pending" | "active" | "completed"
  fill: "pending" | "active" | "completed"
  submit: "pending" | "active" | "completed"
}
