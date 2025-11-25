import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { GenerationProgress, type GenerationStep } from "../GenerationProgress"

describe("GenerationProgress", () => {
  // Step IDs use kebab-case to match backend (collect-data, generate-resume, etc.)
  const mockSteps: GenerationStep[] = [
    {
      id: "collect-data",
      name: "Collect Data",
      description: "Loading experience data",
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

  it("should render all steps", () => {
    render(<GenerationProgress steps={mockSteps} />)

    // Completed step shows completion message, not name
    expect(screen.getByText(/Successfully loaded your experience data/)).toBeInTheDocument()
    // In-progress step shows description, not name
    expect(screen.getByText("AI generating resume")).toBeInTheDocument()
    // Pending step shows name
    expect(screen.getByText("Generate Cover Letter")).toBeInTheDocument()
  })

  it("should show completed step with check icon", () => {
    render(<GenerationProgress steps={mockSteps} />)

    const checkIcon = screen.getByTestId("check-icon")
    expect(checkIcon).toBeInTheDocument()
    expect(checkIcon).toHaveClass("text-green-600")
  })

  it("should show in-progress step with spinner", () => {
    render(<GenerationProgress steps={mockSteps} />)

    const spinner = screen.getByTestId("spinner-icon")
    expect(spinner).toBeInTheDocument()
    expect(spinner).toHaveClass("animate-spin")
  })

  it("should show pending step with empty circle", () => {
    render(<GenerationProgress steps={mockSteps} />)

    const pendingIcon = screen.getByTestId("pending-icon")
    expect(pendingIcon).toBeInTheDocument()
  })

  it("should display step content based on status", () => {
    render(<GenerationProgress steps={mockSteps} />)

    // Completed step shows completion message (not description)
    expect(screen.getByText(/Successfully loaded your experience data/)).toBeInTheDocument()
    // In-progress step shows description
    expect(screen.getByText("AI generating resume")).toBeInTheDocument()
    // Pending step shows name (not description)
    expect(screen.getByText("Generate Cover Letter")).toBeInTheDocument()
  })

  it("should show completion message with duration", () => {
    render(<GenerationProgress steps={mockSteps} />)

    expect(screen.getByText(/Successfully loaded your experience data/)).toBeInTheDocument()
    expect(screen.getByText(/\(1\.0s\)/)).toBeInTheDocument()
  })

  it("should handle failed step", () => {
    const failedSteps: GenerationStep[] = [
      {
        id: "generate-resume",
        name: "Generate Resume",
        description: "AI generating resume",
        status: "failed",
        error: {
          message: "API Error",
          code: "500",
        },
      },
    ]

    render(<GenerationProgress steps={failedSteps} />)

    const errorIcon = screen.getByTestId("error-icon")
    expect(errorIcon).toBeInTheDocument()
    expect(errorIcon).toHaveClass("text-destructive")
    expect(screen.getByText("Error: API Error")).toBeInTheDocument()
  })

  it("should show completion messages for render-pdf step", () => {
    const stepsWithPDFs: GenerationStep[] = [
      {
        id: "render-pdf",
        name: "Render PDF",
        description: "Creating PDF documents",
        status: "completed",
        result: {
          resumeUrl: "https://example.com/resume.pdf",
        },
      },
    ]

    render(<GenerationProgress steps={stepsWithPDFs} />)

    expect(screen.getByText(/PDF documents created and ready/)).toBeInTheDocument()
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

    // Skipped step shows "name (skipped)"
    expect(screen.getByText("Generate Cover Letter (skipped)")).toBeInTheDocument()
  })

  it("should render empty state when no steps provided", () => {
    render(<GenerationProgress steps={[]} />)

    // Should render the progress container even with no steps
    const progressContainer = screen.getByTestId("generation-progress")
    expect(progressContainer).toBeInTheDocument()
  })

  it("should display step duration correctly", () => {
    const stepWithDuration: GenerationStep[] = [
      {
        id: "render-pdf",
        name: "Render PDF",
        description: "Creating PDFs",
        status: "completed",
        duration: 2500,
      },
    ]

    render(<GenerationProgress steps={stepWithDuration} />)

    // Completed step shows completion message with duration
    expect(screen.getByText(/PDF documents created and ready \(2\.5s\)/)).toBeInTheDocument()
  })
})
