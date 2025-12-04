import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { ScrapeJobDialog } from "../ScrapeJobDialog"
import { queueClient } from "@/api"

// Mock the API client
vi.mock("@/api", () => ({
  queueClient: {
    submitScrape: vi.fn(),
  },
}))

// Mock useJobSources hook
vi.mock("@/hooks/useJobSources", () => ({
  useJobSources: () => ({
    sources: [
      { id: "source-1", name: "Test Source 1", sourceType: "greenhouse" },
      { id: "source-2", name: "Test Source 2", sourceType: "lever" },
    ],
    loading: false,
  }),
}))

describe("ScrapeJobDialog", () => {
  const mockOnOpenChange = vi.fn()
  const mockOnSubmitted = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("renders the dialog when open", () => {
    render(
      <ScrapeJobDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmitted={mockOnSubmitted}
      />
    )

    expect(screen.getByText("Schedule a scrape")).toBeInTheDocument()
    expect(screen.getByLabelText("Target matches")).toBeInTheDocument()
    expect(screen.getByLabelText("Max sources")).toBeInTheDocument()
  })

  it("submits scrape job successfully and closes dialog", async () => {
    const user = userEvent.setup()
    vi.mocked(queueClient.submitScrape).mockResolvedValueOnce({
      id: "test-id",
      type: "scrape",
      status: "pending",
      url: "",
      company_name: "",
      company_id: null,
      source: "user_submission",
      created_at: new Date(),
      updated_at: new Date(),
    })

    render(
      <ScrapeJobDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmitted={mockOnSubmitted}
      />
    )

    await user.click(screen.getByRole("button", { name: "Create scrape" }))

    await waitFor(() => {
      expect(queueClient.submitScrape).toHaveBeenCalled()
      expect(mockOnSubmitted).toHaveBeenCalled()
      expect(mockOnOpenChange).toHaveBeenCalledWith(false)
    })
  })

  it("displays error message when submission fails", async () => {
    const user = userEvent.setup()
    vi.mocked(queueClient.submitScrape).mockRejectedValueOnce(
      new Error("Network error: Failed to connect")
    )

    render(
      <ScrapeJobDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmitted={mockOnSubmitted}
      />
    )

    await user.click(screen.getByRole("button", { name: "Create scrape" }))

    await waitFor(() => {
      expect(screen.getByText("Network error: Failed to connect")).toBeInTheDocument()
    })

    // Dialog should remain open
    expect(mockOnOpenChange).not.toHaveBeenCalled()
    expect(mockOnSubmitted).not.toHaveBeenCalled()
  })

  it("displays generic error when non-Error is thrown", async () => {
    const user = userEvent.setup()
    vi.mocked(queueClient.submitScrape).mockRejectedValueOnce("Something unexpected")

    render(
      <ScrapeJobDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmitted={mockOnSubmitted}
      />
    )

    await user.click(screen.getByRole("button", { name: "Create scrape" }))

    await waitFor(() => {
      expect(screen.getByText("Failed to create scrape job")).toBeInTheDocument()
    })
  })

  it("clears error when dialog reopens", async () => {
    const user = userEvent.setup()
    vi.mocked(queueClient.submitScrape).mockRejectedValueOnce(new Error("Test error"))

    const { rerender } = render(
      <ScrapeJobDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmitted={mockOnSubmitted}
      />
    )

    // Trigger error
    await user.click(screen.getByRole("button", { name: "Create scrape" }))
    await waitFor(() => {
      expect(screen.getByText("Test error")).toBeInTheDocument()
    })

    // Close and reopen dialog
    rerender(
      <ScrapeJobDialog
        open={false}
        onOpenChange={mockOnOpenChange}
        onSubmitted={mockOnSubmitted}
      />
    )
    rerender(
      <ScrapeJobDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmitted={mockOnSubmitted}
      />
    )

    // Error should be cleared
    expect(screen.queryByText("Test error")).not.toBeInTheDocument()
  })

  it("allows selecting sources", async () => {
    const user = userEvent.setup()

    render(
      <ScrapeJobDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmitted={mockOnSubmitted}
      />
    )

    // Find and click a source checkbox
    const checkboxes = screen.getAllByRole("checkbox")
    const source1Checkbox = checkboxes.find(
      (cb) => cb.closest("label")?.textContent?.includes("Test Source 1")
    )
    expect(source1Checkbox).toBeDefined()
    await user.click(source1Checkbox!)

    // Should show selected badge (remove button appears when selected)
    expect(screen.getByRole("button", { name: /Remove Test Source 1/i })).toBeInTheDocument()
  })

  it("prefills source when prefillSourceId is provided", () => {
    render(
      <ScrapeJobDialog
        open={true}
        onOpenChange={mockOnOpenChange}
        onSubmitted={mockOnSubmitted}
        prefillSourceId="source-1"
      />
    )

    // The source should be pre-selected (checkbox checked)
    const checkboxes = screen.getAllByRole("checkbox")
    const source1Checkbox = checkboxes.find(
      (cb) => cb.closest("label")?.textContent?.includes("Test Source 1")
    )
    expect(source1Checkbox).toBeChecked()
  })
})
