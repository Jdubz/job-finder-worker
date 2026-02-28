/**
 * Extracted review flow logic with dependency injection for testability.
 *
 * Fixes two bugs:
 * 1. Modal flash: submitReview() no longer hides/re-shows the modal when
 *    transitioning between resume and cover letter review. Instead it shows
 *    a loading state in-place.
 * 2. Dual concurrent calls: The redundant IPC event was removed from main.ts,
 *    and this module handles the invoke return directly.
 */

import type { GenerationProgress } from "../types.js"
import type { ResumeContent, CoverLetterContent, DraftContentResponse } from "@shared/types"

// ============================================================================
// Interfaces
// ============================================================================

export interface ReviewFlowState {
  currentReviewRequestId: string | null
  currentReviewDocumentType: "resume" | "coverLetter" | null
  currentReviewContent: ResumeContent | CoverLetterContent | null
}

export interface ReviewFlowDeps {
  api: {
    fetchDraftContent(requestId: string): Promise<{ success: boolean; data?: DraftContentResponse; message?: string }>
    submitDocumentReview(options: {
      requestId: string
      documentType: "resume" | "coverLetter"
      content: ResumeContent | CoverLetterContent
    }): Promise<{ success: boolean; data?: GenerationProgress; message?: string }>
    hideBrowserView(): Promise<{ success: boolean }>
    showBrowserView(): Promise<{ success: boolean }>
  }
  dom: {
    reviewModalOverlay: { classList: { add(c: string): void; remove(c: string): void } }
    reviewTitle: { textContent: string | null }
    reviewContent: { innerHTML: string }
    approveReviewBtn: { disabled: boolean }
    cancelReviewBtn: { disabled: boolean }
    rejectReviewBtn: { disabled: boolean; textContent: string | null }
    reviewFeedbackArea: { classList: { add(c: string): void } }
    reviewFeedbackInput: { value: string }
    generationProgress: { classList: { add(c: string): void; remove(c: string): void } }
    generateBtn: { disabled: boolean }
  }
  setStatus(message: string, type: "success" | "error" | "loading" | ""): void
  renderReviewForm(documentType: "resume" | "coverLetter", content: ResumeContent | CoverLetterContent): void
  collectReviewedContent(): ResumeContent | CoverLetterContent | null
  handleGenerationProgress(progress: GenerationProgress): void
  log: {
    info(...args: unknown[]): void
    error(...args: unknown[]): void
  }
}

// ============================================================================
// Functions
// ============================================================================

export async function handleGenerationAwaitingReview(
  progress: GenerationProgress,
  state: ReviewFlowState,
  deps: ReviewFlowDeps
): Promise<void> {
  deps.log.info("Generation awaiting review:", progress.requestId)

  // Show loading state while fetching draft
  deps.setStatus("Loading content for review...", "loading")

  // Fetch the draft content
  const result = await deps.api.fetchDraftContent(progress.requestId)
  if (!result.success || !result.data) {
    deps.setStatus(result.message || "Failed to fetch draft content", "error")
    deps.dom.generationProgress.classList.add("hidden")
    deps.dom.generateBtn.disabled = false
    return
  }

  const draft = result.data
  state.currentReviewRequestId = progress.requestId
  state.currentReviewDocumentType = draft.documentType
  state.currentReviewContent = draft.content
  deps.log.info("handleGenerationAwaitingReview: State set", {
    requestId: state.currentReviewRequestId,
    documentType: state.currentReviewDocumentType,
    hasContent: !!state.currentReviewContent,
  })

  // Hide generation progress, show review modal
  deps.dom.generationProgress.classList.add("hidden")

  // Hide BrowserView so modal overlay is visible (BrowserView renders on top of HTML)
  deps.log.info("handleGenerationAwaitingReview: Hiding BrowserView...")
  const hideResult = await deps.api.hideBrowserView()
  deps.log.info("handleGenerationAwaitingReview: hideBrowserView result", hideResult)
  deps.dom.reviewModalOverlay.classList.remove("hidden")
  deps.log.info("handleGenerationAwaitingReview: Modal shown")

  // Set title based on document type
  const docTypeLabel = draft.documentType === "resume" ? "resume" : "cover letter"
  deps.dom.reviewTitle.textContent = draft.documentType === "resume" ? "Review Resume" : "Review Cover Letter"

  // Render the editable content
  deps.renderReviewForm(draft.documentType, draft.content)

  deps.setStatus(`Review your ${docTypeLabel} before generating PDF`, "loading")
}

export async function submitReview(
  state: ReviewFlowState,
  deps: ReviewFlowDeps
): Promise<void> {
  deps.log.info("submitReview called", {
    currentReviewRequestId: state.currentReviewRequestId,
    currentReviewDocumentType: state.currentReviewDocumentType,
  })

  if (!state.currentReviewRequestId || !state.currentReviewDocumentType) {
    deps.log.error("submitReview: No review in progress", {
      currentReviewRequestId: state.currentReviewRequestId,
      currentReviewDocumentType: state.currentReviewDocumentType,
    })
    deps.setStatus("No review in progress", "error")
    return
  }

  const editedContent = deps.collectReviewedContent()
  if (!editedContent) {
    deps.log.error("submitReview: Failed to collect content")
    deps.setStatus("Failed to collect reviewed content", "error")
    return
  }

  deps.log.info("submitReview: Submitting...", { documentType: state.currentReviewDocumentType })
  deps.setStatus("Submitting review...", "loading")
  deps.dom.approveReviewBtn.disabled = true

  try {
    const result = await deps.api.submitDocumentReview({
      requestId: state.currentReviewRequestId,
      documentType: state.currentReviewDocumentType,
      content: editedContent,
    })

    deps.log.info("submitReview: Got result", {
      success: result.success,
      status: result.data?.status,
      message: result.message,
    })

    if (result.success && result.data) {
      if (result.data.status === "awaiting_review") {
        // Another document needs review — show loading state IN-PLACE (no flash).
        // Keep the modal visible but disable interaction and show loading content.
        deps.dom.approveReviewBtn.disabled = true
        deps.dom.cancelReviewBtn.disabled = true
        deps.dom.rejectReviewBtn.disabled = true
        deps.dom.reviewTitle.textContent = "Loading Next Document..."
        deps.dom.reviewContent.innerHTML =
          '<div class="empty-placeholder">Loading next document for review...</div>'
        deps.setStatus("Review submitted. Loading next document...", "loading")

        // Clear document-specific state for the completed review step.
        // Keep currentReviewRequestId — it tracks the overall generation
        // flow and will be updated by handleGenerationAwaitingReview on
        // success, or used for recovery if loading the next document fails.
        state.currentReviewDocumentType = null
        state.currentReviewContent = null
        // Reset feedback area
        deps.dom.reviewFeedbackArea.classList.add("hidden")
        deps.dom.reviewFeedbackInput.value = ""
        deps.dom.rejectReviewBtn.textContent = "Reject & Retry"

        try {
          // Fetch and render next document in-place
          await handleGenerationAwaitingReview(result.data, state, deps)
          // Guard: handleGenerationAwaitingReview returns early (no throw)
          // when fetchDraftContent resolves with {success:false}, leaving
          // state null. Detect and treat as failure.
          if (!state.currentReviewDocumentType || !state.currentReviewContent) {
            throw new Error("Failed to load next document for review")
          }
          // Re-enable buttons after successfully loading the next document
          deps.dom.approveReviewBtn.disabled = false
          deps.dom.cancelReviewBtn.disabled = false
          deps.dom.rejectReviewBtn.disabled = false
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Failed to load next document for review"
          deps.setStatus(message, "error")
          // Close the modal and restore BrowserView to avoid inconsistent state
          deps.dom.reviewModalOverlay.classList.add("hidden")
          state.currentReviewRequestId = null
          await deps.api.showBrowserView()
        }
      } else {
        // Generation completed or continuing — hide modal and clean up
        deps.dom.reviewModalOverlay.classList.add("hidden")
        deps.dom.approveReviewBtn.disabled = false
        state.currentReviewRequestId = null
        state.currentReviewDocumentType = null
        state.currentReviewContent = null
        // Reset feedback area
        deps.dom.reviewFeedbackArea.classList.add("hidden")
        deps.dom.reviewFeedbackInput.value = ""
        deps.dom.rejectReviewBtn.textContent = "Reject & Retry"

        // Restore BrowserView now that modal is closed
        await deps.api.showBrowserView()
        if (result.data.status === "completed") {
          deps.handleGenerationProgress(result.data)
        } else {
          // Generation is continuing
          deps.dom.generationProgress.classList.remove("hidden")
          deps.setStatus("Generating PDF...", "loading")
        }
      }
    } else {
      deps.setStatus(result.message || "Failed to submit review", "error")
      deps.dom.approveReviewBtn.disabled = false
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to submit review"
    deps.setStatus(message, "error")
    deps.dom.approveReviewBtn.disabled = false
  }
}
