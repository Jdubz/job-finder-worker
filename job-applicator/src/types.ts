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
 *
 * NOTE: The 'children' property is intentionally redefined as ContentItem[] rather than
 * using SharedContentItemNode['children']. This creates a simplified recursive structure
 * optimized for prompt serialization, which may have fewer properties than the full
 * SharedContentItemNode. When mapping from SharedContentItemNode to ContentItem,
 * the conversion is type-safe because ContentItem is a subset of SharedContentItemNode.
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
// Vision Agent Types (app-specific)
// ============================================================================

/** Action kinds the vision agent can perform */
export type AgentActionKind = "click" | "double_click" | "type" | "scroll" | "keypress" | "wait" | "done"

/** Action schema returned by CLI */
export interface AgentAction {
  kind: AgentActionKind
  x?: number // click/double_click
  y?: number // click/double_click
  text?: string // type
  dx?: number // scroll (default 0)
  dy?: number // scroll (default 0)
  key?: "Tab" | "Enter" | "Escape" | "Backspace" | "SelectAll" // keypress
  ms?: number // wait
  reason?: string // done
}

/** Result of executing an action */
export interface AgentActionResult {
  step: number
  action: AgentAction
  result: "ok" | "blocked" | "error"
  error?: string
}

/** Progress updates sent during agent execution */
export interface AgentProgress {
  phase: "starting" | "running" | "completed" | "failed"
  step: number
  totalSteps: number
  currentAction?: AgentAction
  lastResult?: "ok" | "blocked" | "error"
  message: string
  screenshotHash?: string
}

/** Final summary after agent completes */
export interface AgentSummary {
  stepsUsed: number
  stopReason: "done" | "limit" | "stuck" | "error"
  elapsedMs: number
  finalReason?: string // from done action or error message
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
