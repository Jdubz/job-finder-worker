import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { GenerationProgress, type GenerationStep } from "../GenerationProgress"

describe("GenerationProgress", () => {
  const mockSteps: GenerationStep[] = [
    {
      id: "fetch_data",
      name: "Fetch Data",
      description: "Loading experience data",
      status: "completed",
      startedAt: new Date("2025-01-01T10:00:00Z"),
      completedAt: new Date("2025-01-01T10:00:01Z"),
      duration: 1000,
    },
    {
      id: "generate_resume",
      name: "Generate Resume",
      description: "AI generating resume",
      status: "in_progress",
      startedAt: new Date("2025-01-01T10:00:01Z"),
    },
    {
      id: "generate_cover_letter",
      name: "Generate Cover Letter",
      description: "AI generating cover letter",
      status: "pending",
    },
  ]

  it("should render all steps", () => {
    render(<GenerationProgress steps={mockSteps} />)

    expect(screen.getByText("Fetch Data")).toBeInTheDocument()
    expect(screen.getByText("Generate Resume")).toBeInTheDocument()
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

  it("should display step descriptions", () => {
    render(<GenerationProgress steps={mockSteps} />)

    expect(screen.getByText("Loading experience data")).toBeInTheDocument()
    expect(screen.getByText("AI generating resume")).toBeInTheDocument()
    expect(screen.getByText("AI generating cover letter")).toBeInTheDocument()
  })

  it("should show completion message with duration", () => {
    render(<GenerationProgress steps={mockSteps} />)

    expect(screen.getByText(/Successfully loaded your experience data/)).toBeInTheDocument()
    expect(screen.getByText(/\(1\.0s\)/)).toBeInTheDocument()
  })

  it("should handle failed step", () => {
    const failedSteps: GenerationStep[] = [
      {
        id: "generate_resume",
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
    expect(screen.getByText("API Error")).toBeInTheDocument()
  })

  it("should show download links for completed PDF steps", () => {
    const stepsWithPDFs: GenerationStep[] = [
      {
        id: "create_resume_pdf",
        name: "Create Resume PDF",
        description: "Creating PDF",
        status: "completed",
        result: {
          resumeUrl: "https://example.com/resume.pdf",
        },
      },
      {
        id: "create_cover_letter_pdf",
        name: "Create Cover Letter PDF",
        description: "Creating PDF",
        status: "completed",
        result: {
          coverLetterUrl: "https://example.com/cover-letter.pdf",
        },
      },
    ]

    render(<GenerationProgress steps={stepsWithPDFs} />)

    const links = screen.getAllByRole("link")
    expect(links).toHaveLength(2)
    expect(links[0]).toHaveAttribute("href", "https://example.com/resume.pdf")
    expect(links[1]).toHaveAttribute("href", "https://example.com/cover-letter.pdf")
  })

  it("should handle skipped steps", () => {
    const skippedSteps: GenerationStep[] = [
      {
        id: "generate_cover_letter",
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

    const card = screen.getByRole("region")
    expect(card).toBeInTheDocument()
  })

  it("should display step duration correctly", () => {
    const stepWithDuration: GenerationStep[] = [
      {
        id: "upload_documents",
        name: "Upload Documents",
        description: "Uploading",
        status: "completed",
        duration: 2500,
      },
    ]

    render(<GenerationProgress steps={stepWithDuration} />)

    expect(screen.getByText(/\(2\.5s\)/)).toBeInTheDocument()
  })
})
