import { describe, it, expect, vi } from "vitest"
import {
  handleGenerationAwaitingReview,
  submitReview,
} from "./review-flow.js"
import type { ReviewFlowState, ReviewFlowDeps } from "./review-flow.js"
import type { GenerationProgress } from "../types.js"

// ============================================================================
// Test Helpers
// ============================================================================

function createState(overrides: Partial<ReviewFlowState> = {}): ReviewFlowState {
  return {
    currentReviewRequestId: null,
    currentReviewDocumentType: null,
    currentReviewContent: null,
    ...overrides,
  }
}

function createDeps(overrides: Partial<ReviewFlowDeps> = {}): ReviewFlowDeps {
  return {
    api: {
      fetchDraftContent: vi.fn().mockResolvedValue({ success: true, data: null }),
      submitDocumentReview: vi.fn().mockResolvedValue({ success: true, data: null }),
      hideBrowserView: vi.fn().mockResolvedValue({ success: true }),
      showBrowserView: vi.fn().mockResolvedValue({ success: true }),
      ...overrides.api,
    },
    dom: {
      reviewModalOverlay: { classList: { add: vi.fn(), remove: vi.fn() } },
      reviewTitle: { textContent: null },
      reviewContent: { innerHTML: "" },
      approveReviewBtn: { disabled: false },
      cancelReviewBtn: { disabled: false },
      rejectReviewBtn: { disabled: false, textContent: "Reject & Retry" },
      reviewFeedbackArea: { classList: { add: vi.fn() } },
      reviewFeedbackInput: { value: "" },
      generationProgress: { classList: { add: vi.fn(), remove: vi.fn() } },
      generateBtn: { disabled: false },
      ...overrides.dom,
    },
    setStatus: vi.fn(),
    renderReviewForm: vi.fn(),
    collectReviewedContent: vi.fn().mockReturnValue(null),
    handleGenerationProgress: vi.fn(),
    log: { info: vi.fn(), error: vi.fn() },
    ...overrides,
  }
}

function makeProgress(overrides: Partial<GenerationProgress> = {}): GenerationProgress {
  return {
    requestId: "req-123",
    status: "awaiting_review",
    steps: [],
    ...overrides,
  }
}

const MOCK_RESUME_CONTENT = {
  personalInfo: { name: "Test", title: "Engineer", summary: "", contact: { email: "", phone: "" } },
  professionalSummary: "Summary",
  experience: [],
  education: [],
  skills: { technical: [], soft: [] },
} as const

const MOCK_COVER_LETTER = {
  greeting: "Dear Hiring Manager,",
  openingParagraph: "I am writing...",
  bodyParagraphs: ["Body"],
  closingParagraph: "Thank you",
  signature: "Sincerely,",
} as const

// ============================================================================
// handleGenerationAwaitingReview
// ============================================================================

describe("handleGenerationAwaitingReview", () => {
  it("fetches draft and shows review modal with correct title/form", async () => {
    const state = createState()
    const deps = createDeps({
      api: {
        fetchDraftContent: vi.fn().mockResolvedValue({
          success: true,
          data: {
            requestId: "req-123",
            documentType: "resume",
            content: MOCK_RESUME_CONTENT,
            status: "awaiting_review",
          },
        }),
        submitDocumentReview: vi.fn(),
        hideBrowserView: vi.fn().mockResolvedValue({ success: true }),
        showBrowserView: vi.fn(),
      },
    })

    await handleGenerationAwaitingReview(makeProgress(), state, deps)

    expect(deps.api.fetchDraftContent).toHaveBeenCalledWith("req-123")
    expect(state.currentReviewRequestId).toBe("req-123")
    expect(state.currentReviewDocumentType).toBe("resume")
    expect(state.currentReviewContent).toEqual(MOCK_RESUME_CONTENT)
    expect(deps.dom.reviewTitle.textContent).toBe("Review Resume")
    expect(deps.dom.reviewModalOverlay.classList.remove).toHaveBeenCalledWith("hidden")
    expect(deps.renderReviewForm).toHaveBeenCalledWith("resume", MOCK_RESUME_CONTENT)
    expect(deps.setStatus).toHaveBeenCalledWith("Review your resume before generating PDF", "loading")
  })

  it("shows error and re-enables generate button on fetch failure", async () => {
    const state = createState()
    const deps = createDeps({
      api: {
        fetchDraftContent: vi.fn().mockResolvedValue({
          success: false,
          message: "Network error",
        }),
        submitDocumentReview: vi.fn(),
        hideBrowserView: vi.fn(),
        showBrowserView: vi.fn(),
      },
    })

    await handleGenerationAwaitingReview(makeProgress(), state, deps)

    expect(deps.setStatus).toHaveBeenCalledWith("Network error", "error")
    expect(deps.dom.generationProgress.classList.add).toHaveBeenCalledWith("hidden")
    expect(deps.dom.generateBtn.disabled).toBe(false)
    // State should not be set
    expect(state.currentReviewRequestId).toBeNull()
  })
})

// ============================================================================
// submitReview
// ============================================================================

describe("submitReview", () => {
  it("returns early with error when no review in progress", async () => {
    const state = createState()
    const deps = createDeps()

    await submitReview(state, deps)

    expect(deps.setStatus).toHaveBeenCalledWith("No review in progress", "error")
    expect(deps.api.submitDocumentReview).not.toHaveBeenCalled()
  })

  it("returns early with error when collectReviewedContent returns null", async () => {
    const state = createState({
      currentReviewRequestId: "req-123",
      currentReviewDocumentType: "resume",
      currentReviewContent: { ...MOCK_RESUME_CONTENT },
    })
    const deps = createDeps({
      collectReviewedContent: vi.fn().mockReturnValue(null),
    })

    await submitReview(state, deps)

    expect(deps.setStatus).toHaveBeenCalledWith("Failed to collect reviewed content", "error")
    expect(deps.api.submitDocumentReview).not.toHaveBeenCalled()
  })

  it("single document approval (completed): hides modal, shows BrowserView, calls handleGenerationProgress", async () => {
    const completedProgress = makeProgress({ status: "completed" })
    const state = createState({
      currentReviewRequestId: "req-123",
      currentReviewDocumentType: "resume",
      currentReviewContent: { ...MOCK_RESUME_CONTENT },
    })
    const deps = createDeps({
      collectReviewedContent: vi.fn().mockReturnValue(MOCK_RESUME_CONTENT),
      api: {
        fetchDraftContent: vi.fn(),
        submitDocumentReview: vi.fn().mockResolvedValue({
          success: true,
          data: completedProgress,
        }),
        hideBrowserView: vi.fn(),
        showBrowserView: vi.fn().mockResolvedValue({ success: true }),
      },
    })

    await submitReview(state, deps)

    // Modal should be hidden
    expect(deps.dom.reviewModalOverlay.classList.add).toHaveBeenCalledWith("hidden")
    // BrowserView restored
    expect(deps.api.showBrowserView).toHaveBeenCalled()
    // Generation progress callback called
    expect(deps.handleGenerationProgress).toHaveBeenCalledWith(completedProgress)
    // State cleared
    expect(state.currentReviewRequestId).toBeNull()
    expect(state.currentReviewDocumentType).toBeNull()
  })

  it("resume-then-cover-letter (awaiting_review): does NOT hide modal (no flash), shows loading state", async () => {
    const awaitingProgress = makeProgress({ status: "awaiting_review" })
    const state = createState({
      currentReviewRequestId: "req-123",
      currentReviewDocumentType: "resume",
      currentReviewContent: { ...MOCK_RESUME_CONTENT },
    })
    const deps = createDeps({
      collectReviewedContent: vi.fn().mockReturnValue(MOCK_RESUME_CONTENT),
      api: {
        submitDocumentReview: vi.fn().mockResolvedValue({
          success: true,
          data: awaitingProgress,
        }),
        fetchDraftContent: vi.fn().mockResolvedValue({
          success: true,
          data: {
            requestId: "req-123",
            documentType: "coverLetter",
            content: MOCK_COVER_LETTER,
            status: "awaiting_review",
          },
        }),
        hideBrowserView: vi.fn().mockResolvedValue({ success: true }),
        showBrowserView: vi.fn(),
      },
    })

    await submitReview(state, deps)

    // Modal should NOT be hidden (no flash)
    expect(deps.dom.reviewModalOverlay.classList.add).not.toHaveBeenCalledWith("hidden")
    // Loading state shown in-place
    expect(deps.dom.reviewTitle.textContent).toBe("Review Cover Letter")
    // fetchDraftContent called for the next document
    expect(deps.api.fetchDraftContent).toHaveBeenCalledWith("req-123")
    // State updated to cover letter
    expect(state.currentReviewDocumentType).toBe("coverLetter")
    expect(state.currentReviewContent).toEqual(MOCK_COVER_LETTER)
  })

  it("buttons disabled during loading, re-enabled after", async () => {
    const awaitingProgress = makeProgress({ status: "awaiting_review" })
    const state = createState({
      currentReviewRequestId: "req-123",
      currentReviewDocumentType: "resume",
      currentReviewContent: { ...MOCK_RESUME_CONTENT },
    })

    // Track button disable states over time
    const approveStates: boolean[] = []
    const cancelStates: boolean[] = []
    const rejectStates: boolean[] = []
    const approveBtn = {
      get disabled() { return approveStates[approveStates.length - 1] ?? false },
      set disabled(v: boolean) { approveStates.push(v) },
    }
    const cancelBtn = {
      get disabled() { return cancelStates[cancelStates.length - 1] ?? false },
      set disabled(v: boolean) { cancelStates.push(v) },
    }
    const rejectBtn = {
      get disabled() { return rejectStates[rejectStates.length - 1] ?? false },
      set disabled(v: boolean) { rejectStates.push(v) },
      textContent: "Reject & Retry" as string | null,
    }

    const deps = createDeps({
      collectReviewedContent: vi.fn().mockReturnValue(MOCK_RESUME_CONTENT),
      api: {
        submitDocumentReview: vi.fn().mockResolvedValue({
          success: true,
          data: awaitingProgress,
        }),
        fetchDraftContent: vi.fn().mockResolvedValue({
          success: true,
          data: {
            requestId: "req-123",
            documentType: "coverLetter",
            content: MOCK_COVER_LETTER,
            status: "awaiting_review",
          },
        }),
        hideBrowserView: vi.fn().mockResolvedValue({ success: true }),
        showBrowserView: vi.fn(),
      },
      dom: {
        ...createDeps().dom,
        approveReviewBtn: approveBtn,
        cancelReviewBtn: cancelBtn,
        rejectReviewBtn: rejectBtn,
      },
    })

    await submitReview(state, deps)

    // Approve button: disabled for submit, disabled for loading, re-enabled
    expect(approveStates).toContain(true)
    expect(approveStates[approveStates.length - 1]).toBe(false)
    // Cancel button: disabled during loading, re-enabled
    expect(cancelStates).toContain(true)
    expect(cancelStates[cancelStates.length - 1]).toBe(false)
    // Reject button: disabled during loading, re-enabled
    expect(rejectStates).toContain(true)
    expect(rejectStates[rejectStates.length - 1]).toBe(false)
  })

  it("error from API: shows error message, re-enables approve button", async () => {
    const state = createState({
      currentReviewRequestId: "req-123",
      currentReviewDocumentType: "resume",
      currentReviewContent: { ...MOCK_RESUME_CONTENT },
    })
    const deps = createDeps({
      collectReviewedContent: vi.fn().mockReturnValue(MOCK_RESUME_CONTENT),
      api: {
        fetchDraftContent: vi.fn(),
        submitDocumentReview: vi.fn().mockResolvedValue({
          success: false,
          message: "Server error",
        }),
        hideBrowserView: vi.fn(),
        showBrowserView: vi.fn(),
      },
    })

    await submitReview(state, deps)

    expect(deps.setStatus).toHaveBeenCalledWith("Server error", "error")
    expect(deps.dom.approveReviewBtn.disabled).toBe(false)
  })

  it("exception thrown: shows error message, re-enables approve button", async () => {
    const state = createState({
      currentReviewRequestId: "req-123",
      currentReviewDocumentType: "resume",
      currentReviewContent: { ...MOCK_RESUME_CONTENT },
    })
    const deps = createDeps({
      collectReviewedContent: vi.fn().mockReturnValue(MOCK_RESUME_CONTENT),
      api: {
        fetchDraftContent: vi.fn(),
        submitDocumentReview: vi.fn().mockRejectedValue(new Error("Connection lost")),
        hideBrowserView: vi.fn(),
        showBrowserView: vi.fn(),
      },
    })

    await submitReview(state, deps)

    expect(deps.setStatus).toHaveBeenCalledWith("Connection lost", "error")
    expect(deps.dom.approveReviewBtn.disabled).toBe(false)
  })

  it("fetchDraftContent called exactly once (regression test for dual-call bug)", async () => {
    const awaitingProgress = makeProgress({ status: "awaiting_review" })
    const state = createState({
      currentReviewRequestId: "req-123",
      currentReviewDocumentType: "resume",
      currentReviewContent: { ...MOCK_RESUME_CONTENT },
    })
    const fetchDraftContent = vi.fn().mockResolvedValue({
      success: true,
      data: {
        requestId: "req-123",
        documentType: "coverLetter",
        content: MOCK_COVER_LETTER,
        status: "awaiting_review",
      },
    })
    const deps = createDeps({
      collectReviewedContent: vi.fn().mockReturnValue(MOCK_RESUME_CONTENT),
      api: {
        submitDocumentReview: vi.fn().mockResolvedValue({
          success: true,
          data: awaitingProgress,
        }),
        fetchDraftContent,
        hideBrowserView: vi.fn().mockResolvedValue({ success: true }),
        showBrowserView: vi.fn(),
      },
    })

    await submitReview(state, deps)

    // fetchDraftContent should be called exactly once (not twice from dual IPC)
    expect(fetchDraftContent).toHaveBeenCalledTimes(1)
  })

  it("next document fetch failure: closes modal, restores BrowserView, clears state", async () => {
    const awaitingProgress = makeProgress({ status: "awaiting_review" })
    const state = createState({
      currentReviewRequestId: "req-123",
      currentReviewDocumentType: "resume",
      currentReviewContent: { ...MOCK_RESUME_CONTENT },
    })
    const deps = createDeps({
      collectReviewedContent: vi.fn().mockReturnValue(MOCK_RESUME_CONTENT),
      api: {
        submitDocumentReview: vi.fn().mockResolvedValue({
          success: true,
          data: awaitingProgress,
        }),
        // fetchDraftContent fails when loading the next document
        fetchDraftContent: vi.fn().mockRejectedValue(new Error("Network timeout")),
        hideBrowserView: vi.fn().mockResolvedValue({ success: true }),
        showBrowserView: vi.fn().mockResolvedValue({ success: true }),
      },
    })

    await submitReview(state, deps)

    // Modal should be closed on failure
    expect(deps.dom.reviewModalOverlay.classList.add).toHaveBeenCalledWith("hidden")
    // BrowserView should be restored
    expect(deps.api.showBrowserView).toHaveBeenCalled()
    // State should be fully cleared
    expect(state.currentReviewRequestId).toBeNull()
    expect(state.currentReviewDocumentType).toBeNull()
    expect(state.currentReviewContent).toBeNull()
    // Error message shown
    expect(deps.setStatus).toHaveBeenCalledWith("Network timeout", "error")
  })

  it("requestId preserved across document transitions until flow completes", async () => {
    const awaitingProgress = makeProgress({ status: "awaiting_review" })
    const state = createState({
      currentReviewRequestId: "req-123",
      currentReviewDocumentType: "resume",
      currentReviewContent: { ...MOCK_RESUME_CONTENT },
    })

    // Track when requestId changes
    const requestIdSnapshots: (string | null)[] = []
    const originalFetchDraft = vi.fn().mockImplementation(async () => {
      // Capture requestId state at the moment fetchDraftContent is called
      requestIdSnapshots.push(state.currentReviewRequestId)
      return {
        success: true,
        data: {
          requestId: "req-123",
          documentType: "coverLetter",
          content: MOCK_COVER_LETTER,
          status: "awaiting_review",
        },
      }
    })

    const deps = createDeps({
      collectReviewedContent: vi.fn().mockReturnValue(MOCK_RESUME_CONTENT),
      api: {
        submitDocumentReview: vi.fn().mockResolvedValue({
          success: true,
          data: awaitingProgress,
        }),
        fetchDraftContent: originalFetchDraft,
        hideBrowserView: vi.fn().mockResolvedValue({ success: true }),
        showBrowserView: vi.fn(),
      },
    })

    await submitReview(state, deps)

    // requestId should NOT have been null when fetchDraftContent was called
    expect(requestIdSnapshots[0]).toBe("req-123")
  })

  it("generation continuing: shows generation progress, sets loading status", async () => {
    const processingProgress = makeProgress({ status: "processing" })
    const state = createState({
      currentReviewRequestId: "req-123",
      currentReviewDocumentType: "resume",
      currentReviewContent: { ...MOCK_RESUME_CONTENT },
    })
    const deps = createDeps({
      collectReviewedContent: vi.fn().mockReturnValue(MOCK_RESUME_CONTENT),
      api: {
        fetchDraftContent: vi.fn(),
        submitDocumentReview: vi.fn().mockResolvedValue({
          success: true,
          data: processingProgress,
        }),
        hideBrowserView: vi.fn(),
        showBrowserView: vi.fn().mockResolvedValue({ success: true }),
      },
    })

    await submitReview(state, deps)

    expect(deps.dom.generationProgress.classList.remove).toHaveBeenCalledWith("hidden")
    expect(deps.setStatus).toHaveBeenCalledWith("Generating PDF...", "loading")
    expect(deps.handleGenerationProgress).not.toHaveBeenCalled()
  })
})
