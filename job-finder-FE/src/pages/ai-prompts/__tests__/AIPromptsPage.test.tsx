import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { AIPromptsPage } from "../AIPromptsPage"

const mockPrompts = {
  resumeGeneration: "Generate a resume for {{candidateName}}",
  coverLetterGeneration: "Write a cover letter for {{jobTitle}} at {{companyName}}",
  jobScraping: "Extract job details from {{url}}",
  jobMatching: "Match {{candidateSkills}} to {{jobRequirements}}",
}

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({ isOwner: true })),
}))

vi.mock("@/hooks/useAIPrompts", () => ({
  useAIPrompts: vi.fn(() => ({
    prompts: mockPrompts,
    loading: false,
    error: null,
    saving: false,
    savePrompts: vi.fn(),
    resetToDefaults: vi.fn(),
  })),
}))

// Need to import after mocks are set up
import { useAIPrompts } from "@/hooks/useAIPrompts"
import { useAuth } from "@/contexts/AuthContext"

describe("AIPromptsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ isOwner: true } as ReturnType<typeof useAuth>)
    vi.mocked(useAIPrompts).mockReturnValue({
      prompts: mockPrompts,
      loading: false,
      error: null,
      saving: false,
      savePrompts: vi.fn(),
      resetToDefaults: vi.fn(),
    })
  })

  it("renders page title", () => {
    render(<AIPromptsPage />)
    expect(screen.getByText("AI Prompts Configuration")).toBeInTheDocument()
  })

  it("renders loading state", () => {
    vi.mocked(useAIPrompts).mockReturnValue({
      prompts: null,
      loading: true,
      error: null,
      saving: false,
      savePrompts: vi.fn(),
      resetToDefaults: vi.fn(),
    })

    render(<AIPromptsPage />)
    expect(screen.getByText("Loading AI prompts...")).toBeInTheDocument()
  })

  it("renders error when prompts are not configured", () => {
    vi.mocked(useAIPrompts).mockReturnValue({
      prompts: null,
      loading: false,
      error: null,
      saving: false,
      savePrompts: vi.fn(),
      resetToDefaults: vi.fn(),
    })

    render(<AIPromptsPage />)
    expect(
      screen.getByText(/AI prompts configuration is not set in the database/)
    ).toBeInTheDocument()
  })

  it("renders tabs for different prompt types", () => {
    render(<AIPromptsPage />)
    expect(screen.getByRole("tab", { name: "Resume" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Cover Letter" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Job Scraping" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "Job Matching" })).toBeInTheDocument()
  })

  it("displays resume generation prompt by default", () => {
    render(<AIPromptsPage />)
    expect(screen.getByLabelText("Resume Generation Prompt")).toBeInTheDocument()
    expect(screen.getByDisplayValue(mockPrompts.resumeGeneration)).toBeInTheDocument()
  })

  it("switches tabs when clicked", async () => {
    const user = userEvent.setup()
    render(<AIPromptsPage />)

    await user.click(screen.getByRole("tab", { name: "Cover Letter" }))
    expect(screen.getByLabelText("Cover Letter Generation Prompt")).toBeInTheDocument()
    expect(screen.getByDisplayValue(mockPrompts.coverLetterGeneration)).toBeInTheDocument()
  })

  it("shows variable preview when button is clicked", async () => {
    const user = userEvent.setup()
    render(<AIPromptsPage />)

    await user.click(screen.getByRole("button", { name: /Show Variables/i }))
    expect(screen.getByText("Detected Variables:")).toBeInTheDocument()
    expect(screen.getByText("{{candidateName}}")).toBeInTheDocument()
  })

  it("shows save and discard buttons for owners", () => {
    render(<AIPromptsPage />)
    expect(screen.getByRole("button", { name: /Save Prompts/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Discard Changes/i })).toBeInTheDocument()
  })

  it("hides edit buttons for non-owners", () => {
    vi.mocked(useAuth).mockReturnValue({ isOwner: false } as ReturnType<typeof useAuth>)
    render(<AIPromptsPage />)

    expect(screen.queryByRole("button", { name: /Save Prompts/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Discard Changes/i })).not.toBeInTheDocument()
  })

  it("enables save button when content changes", async () => {
    const user = userEvent.setup()
    render(<AIPromptsPage />)

    const saveButton = screen.getByRole("button", { name: /Save Prompts/i })
    expect(saveButton).toBeDisabled() // No changes yet

    const textarea = screen.getByLabelText("Resume Generation Prompt")
    await user.type(textarea, " new content")

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled()
    })
  })

  it("calls savePrompts when save button is clicked", async () => {
    const mockSavePrompts = vi.fn()
    vi.mocked(useAIPrompts).mockReturnValue({
      prompts: mockPrompts,
      loading: false,
      error: null,
      saving: false,
      savePrompts: mockSavePrompts,
      resetToDefaults: vi.fn(),
    })

    const user = userEvent.setup()
    render(<AIPromptsPage />)

    // Make a change first
    const textarea = screen.getByLabelText("Resume Generation Prompt")
    await user.type(textarea, " updated")

    // Click save
    await user.click(screen.getByRole("button", { name: /Save Prompts/i }))

    expect(mockSavePrompts).toHaveBeenCalled()
  })

  it("shows saving state when saving", () => {
    vi.mocked(useAIPrompts).mockReturnValue({
      prompts: mockPrompts,
      loading: false,
      error: null,
      saving: true,
      savePrompts: vi.fn(),
      resetToDefaults: vi.fn(),
    })

    render(<AIPromptsPage />)
    expect(screen.getByText("Saving...")).toBeInTheDocument()
  })
})
