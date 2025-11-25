import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { GenerationProgress, type GenerationStep } from "../GenerationProgress"

describe("GenerationProgress", () => {
  // Step IDs use kebab-case to match backend (collect-data, generate-resume, etc.)
  const mockSteps: GenerationStep[] = [
    {
      id: "collect-data",
      name: "Collect Data",
      description: "Gathering experience data",
      status: "completed",
      startedAt: new Date("2025-01-01T10:00:00Z"),
      completedAt: new Date("2025-01-01T10:00:01Z"),
      duration: 1000,
    },
    {
      id: "generate-resume",
      name: "Generate Resume",
      description: "AI generating resume",
      status: "in_progress",
      startedAt: new Date("2025-01-01T10:00:01Z"),
    },
    {
      id: "generate-cover-letter",
      name: "Generate Cover Letter",
      description: "AI generating cover letter",
      status: "pending",
    },
  ]

  it("should render all steps with names always visible", () => {
    render(<GenerationProgress steps={mockSteps} />)

    // All step names should be visible
    expect(screen.getByText("Collect Data")).toBeInTheDocument()
    expect(screen.getByText("Generate Resume")).toBeInTheDocument()
    expect(screen.getByText("Generate Cover Letter")).toBeInTheDocument()
  })

  it("should show progress header with step count", () => {
    render(<GenerationProgress steps={mockSteps} />)

    // Shows "Step 2 of 3" when second step is in progress
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument()
    expect(screen.getByText("1/3 complete")).toBeInTheDocument()
  })

  it("should show completed step with check icon and description", () => {
    render(<GenerationProgress steps={mockSteps} />)

    const checkIcon = screen.getByTestId("check-icon")
    expect(checkIcon).toBeInTheDocument()
    expect(checkIcon).toHaveClass("text-green-600")
    // Completed step shows what was accomplished
    expect(screen.getByText("Loaded profile, experience, and skills")).toBeInTheDocument()
  })

  it("should show in-progress step with spinner and active description", () => {
    render(<GenerationProgress steps={mockSteps} />)

    const spinner = screen.getByTestId("spinner-icon")
    expect(spinner).toBeInTheDocument()
    expect(spinner).toHaveClass("animate-spin")
    // In-progress step shows what is happening
    expect(screen.getByText("AI is analyzing the job and crafting your resume...")).toBeInTheDocument()
  })

  it("should show pending step with circle and future description", () => {
    render(<GenerationProgress steps={mockSteps} />)

    const pendingIcon = screen.getByTestId("pending-icon")
    expect(pendingIcon).toBeInTheDocument()
    // Pending step shows what will happen
    expect(screen.getByText("Will write a personalized cover letter")).toBeInTheDocument()
  })

  it("should show duration for completed steps", () => {
    render(<GenerationProgress steps={mockSteps} />)

    expect(screen.getByText("1.0s")).toBeInTheDocument()
  })

  it("should handle failed step", () => {
    const failedSteps: GenerationStep[] = [
      {
        id: "generate-resume",
        name: "Generate Resume",
        description: "AI generating resume",
        status: "failed",
        error: {
          message: "API Error: Rate limit exceeded",
          code: "500",
        },
      },
    ]

    render(<GenerationProgress steps={failedSteps} />)

    const errorIcon = screen.getByTestId("error-icon")
    expect(errorIcon).toBeInTheDocument()
    expect(errorIcon).toHaveClass("text-destructive")
    expect(screen.getByText("API Error: Rate limit exceeded")).toBeInTheDocument()
    expect(screen.getByText("Generation Failed")).toBeInTheDocument()
    expect(screen.getByText("Generation encountered an error. Please try again.")).toBeInTheDocument()
  })

  it("should show completion message when all steps done", () => {
    const completedSteps: GenerationStep[] = [
      {
        id: "collect-data",
        name: "Collect Data",
        description: "Done",
        status: "completed",
      },
      {
        id: "render-pdf",
        name: "Render PDF",
        description: "Done",
        status: "completed",
      },
    ]

    render(<GenerationProgress steps={completedSteps} />)

    expect(screen.getByText("Generation Complete")).toBeInTheDocument()
    expect(screen.getByText("Your documents are ready for download")).toBeInTheDocument()
    expect(screen.getByText("2/2 complete")).toBeInTheDocument()
  })

  it("should handle skipped steps", () => {
    const skippedSteps: GenerationStep[] = [
      {
        id: "generate-cover-letter",
        name: "Generate Cover Letter",
        description: "Skipped",
        status: "skipped",
      },
    ]

    render(<GenerationProgress steps={skippedSteps} />)

    expect(screen.getByText("Generate Cover Letter")).toBeInTheDocument()
    expect(screen.getByText("Skipped")).toBeInTheDocument()
  })

  it("should render empty state when no steps provided", () => {
    render(<GenerationProgress steps={[]} />)

    const progressContainer = screen.getByTestId("generation-progress")
    expect(progressContainer).toBeInTheDocument()
    expect(screen.getByText("0/0 complete")).toBeInTheDocument()
  })

  it("should highlight in-progress step with background", () => {
    render(<GenerationProgress steps={mockSteps} />)

    const inProgressStep = screen.getByText("Generate Resume").closest("[data-step-id]")
    expect(inProgressStep).toHaveClass("bg-primary/5")
  })

  it("should show render-pdf descriptions correctly", () => {
    const pdfSteps: GenerationStep[] = [
      {
        id: "render-pdf",
        name: "Render PDF",
        description: "Creating PDFs",
        status: "completed",
        duration: 2500,
      },
    ]

    render(<GenerationProgress steps={pdfSteps} />)

    expect(screen.getByText("Render PDF")).toBeInTheDocument()
    expect(screen.getByText("PDF documents ready for download")).toBeInTheDocument()
    expect(screen.getByText("2.5s")).toBeInTheDocument()
  })
})
