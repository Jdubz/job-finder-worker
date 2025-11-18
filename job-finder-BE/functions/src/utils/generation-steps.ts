/**
 * Generation Steps Management
 *
 * Utilities for creating and updating step-by-step progress tracking
 * during document generation. Steps are stored in Firestore and can be
 * monitored in real-time by the frontend.
 */

import { Timestamp } from "@google-cloud/firestore"
import type { GenerationStep, GenerationType } from "../types/generator.types"
import { timestampToMillis } from "../types/generator.types"

/**
 * Create initial step list based on generation type
 */
export function createInitialSteps(generateType: GenerationType): GenerationStep[] {
  const steps: GenerationStep[] = [
    {
      id: "fetch_data",
      name: "Fetch Experience Data",
      description: "Loading your experience entries and professional blurbs",
      status: "pending",
    },
  ]

  if (generateType === "resume" || generateType === "both") {
    steps.push({
      id: "generate_resume",
      name: "Generate Resume Content",
      description: "Creating tailored resume content with AI",
      status: "pending",
    })
  }

  if (generateType === "coverLetter" || generateType === "both") {
    steps.push({
      id: "generate_cover_letter",
      name: "Generate Cover Letter",
      description: "Writing personalized cover letter with AI",
      status: "pending",
    })
  }

  if (generateType === "resume" || generateType === "both") {
    steps.push({
      id: "create_resume_pdf",
      name: "Create Resume PDF",
      description: "Rendering your resume as a professional PDF",
      status: "pending",
    })
  }

  if (generateType === "coverLetter" || generateType === "both") {
    steps.push({
      id: "create_cover_letter_pdf",
      name: "Create Cover Letter PDF",
      description: "Rendering your cover letter as a PDF",
      status: "pending",
    })
  }

  steps.push({
    id: "upload_documents",
    name: "Upload Documents",
    description: "Securely uploading PDFs to cloud storage",
    status: "pending",
  })

  return steps
}

/**
 * Update a specific step's status
 */
export function updateStep(
  steps: GenerationStep[],
  stepId: string,
  updates: {
    status?: GenerationStep["status"]
    result?: GenerationStep["result"]
    error?: GenerationStep["error"]
  }
): GenerationStep[] {
  return steps.map((step) => {
    if (step.id !== stepId) {
      return step
    }

    const updatedStep: GenerationStep = { ...step, ...updates }

    // Set timestamps based on status
    if (updates.status === "in_progress" && !step.startedAt) {
      updatedStep.startedAt = Timestamp.now()
    }

    if (
      (updates.status === "completed" || updates.status === "failed" || updates.status === "skipped") &&
      !step.completedAt
    ) {
      updatedStep.completedAt = Timestamp.now()

      // Calculate duration if we have both timestamps
      if (updatedStep.startedAt && updatedStep.completedAt) {
        updatedStep.duration = timestampToMillis(updatedStep.completedAt) - timestampToMillis(updatedStep.startedAt)
      }
    }

    return updatedStep
  })
}

/**
 * Mark a step as started (in_progress)
 */
export function startStep(steps: GenerationStep[], stepId: string): GenerationStep[] {
  return updateStep(steps, stepId, { status: "in_progress" })
}

/**
 * Mark a step as completed with optional result data
 */
export function completeStep(
  steps: GenerationStep[],
  stepId: string,
  result?: GenerationStep["result"]
): GenerationStep[] {
  // Filter out undefined result to avoid Firestore errors
  const updates: { status: "completed"; result?: GenerationStep["result"] } = { status: "completed" }
  if (result !== undefined) {
    updates.result = result
  }
  return updateStep(steps, stepId, updates)
}

/**
 * Mark a step as failed with error information
 */
export function failStep(steps: GenerationStep[], stepId: string, error: { message: string; code?: string }): GenerationStep[] {
  return updateStep(steps, stepId, { status: "failed", error })
}

/**
 * Mark a step as skipped (e.g., if user only wants resume, skip cover letter steps)
 */
export function skipStep(steps: GenerationStep[], stepId: string): GenerationStep[] {
  return updateStep(steps, stepId, { status: "skipped" })
}

/**
 * Get the current active step (first in_progress or pending step)
 */
export function getCurrentStep(steps: GenerationStep[]): GenerationStep | null {
  return steps.find((step) => step.status === "in_progress" || step.status === "pending") || null
}

/**
 * Check if all steps are completed
 */
export function allStepsCompleted(steps: GenerationStep[]): boolean {
  return steps.every((step) => step.status === "completed" || step.status === "skipped")
}

/**
 * Check if any step has failed
 */
export function hasFailedStep(steps: GenerationStep[]): boolean {
  return steps.some((step) => step.status === "failed")
}

/**
 * Get progress percentage (0-100)
 */
export function getProgressPercentage(steps: GenerationStep[]): number {
  const total = steps.length
  if (total === 0) {
    return 0
  }

  const completed = steps.filter((step) => step.status === "completed" || step.status === "skipped").length
  return Math.round((completed / total) * 100)
}
