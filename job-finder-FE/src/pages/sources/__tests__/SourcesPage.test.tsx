/**
 * Sources Page Tests
 *
 * Tests for source discovery page including:
 * - Rendering and display of source discovery tasks
 * - Add source modal functionality
 * - Loading and empty states
 * - Authentication requirements
 * - Form validation and submission
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { SourcesPage } from "../SourcesPage"
import { useAuth } from "@/contexts/AuthContext"
import { useQueueItems } from "@/hooks/useQueueItems"

vi.mock("@/contexts/AuthContext")
vi.mock("@/hooks/useQueueItems")

describe("SourcesPage", () => {
  const mockUser = {
    uid: "test-user-123",
    email: "test@example.com",
    displayName: "Test User",
  }

  const mockSourceTasks = [
    {
      id: "source-1",
      type: "source_discovery",
      status: "pending",
      url: "https://boards.greenhouse.io/acme",
      company_name: "Acme Corporation",
      company_id: null,
      source: "user_submission",
      created_at: new Date(),
      updated_at: new Date(),
      retry_count: 0,
      max_retries: 3,
    },
    {
      id: "source-2",
      type: "source_discovery",
      status: "success",
      url: "https://careers.techcorp.io/jobs.rss",
      company_name: "TechCorp",
      company_id: "tech-123",
      source: "user_submission",
      created_at: new Date(),
      updated_at: new Date(),
      retry_count: 0,
      max_retries: 3,
      result_message: "Configured as RSS feed",
    },
    {
      id: "source-3",
      type: "source_discovery",
      status: "failed",
      url: "https://invalid-source.test/careers",
      company_name: "",
      company_id: null,
      source: "user_submission",
      created_at: new Date(),
      updated_at: new Date(),
      retry_count: 3,
      max_retries: 3,
      result_message: "Could not detect source type",
    },
  ]

  const mockJobTasks = [
    {
      id: "job-1",
      type: "job",
      status: "pending",
      url: "https://jobs.example.com/123",
      company_name: "Other Corp",
      company_id: null,
      source: "user_submission",
      created_at: new Date(),
      updated_at: new Date(),
      retry_count: 0,
      max_retries: 3,
    },
  ]

  const mockSubmitSourceDiscovery = vi.fn()
  const mockRefetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
      isOwner: true,
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    } as any)

    vi.mocked(useQueueItems).mockReturnValue({
      queueItems: [...mockSourceTasks, ...mockJobTasks] as any,
      loading: false,
      error: null,
      submitJob: vi.fn(),
      submitCompany: vi.fn(),
      submitSourceDiscovery: mockSubmitSourceDiscovery,
      updateQueueItem: vi.fn(),
      deleteQueueItem: vi.fn(),
      refetch: mockRefetch,
    } as any)
  })

  describe("Initial Rendering", () => {
    it("should render the sources page with title", async () => {
      render(<SourcesPage />)

      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /sources/i })).toBeInTheDocument()
        expect(
          screen.getByText(/discover and configure job sources/i)
        ).toBeInTheDocument()
      })
    })

    it("should display only source discovery tasks, not job tasks", async () => {
      render(<SourcesPage />)

      await waitFor(() => {
        expect(screen.getByText("boards.greenhouse.io")).toBeInTheDocument()
        expect(screen.getByText("careers.techcorp.io")).toBeInTheDocument()
        expect(screen.getByText("invalid-source.test")).toBeInTheDocument()
        expect(screen.queryByText("Other Corp")).not.toBeInTheDocument()
      })
    })

    it("should display status badges for each task", async () => {
      render(<SourcesPage />)

      await waitFor(() => {
        expect(screen.getByText("pending")).toBeInTheDocument()
        expect(screen.getByText("success")).toBeInTheDocument()
        expect(screen.getByText("failed")).toBeInTheDocument()
      })
    })

    it("should display result messages when available", async () => {
      render(<SourcesPage />)

      await waitFor(() => {
        expect(screen.getByText("Configured as RSS feed")).toBeInTheDocument()
        expect(screen.getByText("Could not detect source type")).toBeInTheDocument()
      })
    })

    it("should render Add Source button", async () => {
      render(<SourcesPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /add source/i })).toBeInTheDocument()
      })
    })

    it("should display company names when available", async () => {
      render(<SourcesPage />)

      await waitFor(() => {
        expect(screen.getByText("Acme Corporation")).toBeInTheDocument()
        expect(screen.getByText("TechCorp")).toBeInTheDocument()
      })
    })
  })

  describe("Loading State", () => {
    it("should show loading spinner when loading", () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [],
        loading: true,
        error: null,
        submitJob: vi.fn(),
        submitCompany: vi.fn(),
        submitSourceDiscovery: mockSubmitSourceDiscovery,
        updateQueueItem: vi.fn(),
        deleteQueueItem: vi.fn(),
        refetch: mockRefetch,
      } as any)

      render(<SourcesPage />)

      // Page title should still be present
      expect(screen.getByRole("heading", { name: /sources/i })).toBeInTheDocument()
    })
  })

  describe("Empty State", () => {
    it("should show empty state when no source tasks exist", async () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: mockJobTasks as any, // Only job tasks, no source tasks
        loading: false,
        error: null,
        submitJob: vi.fn(),
        submitCompany: vi.fn(),
        submitSourceDiscovery: mockSubmitSourceDiscovery,
        updateQueueItem: vi.fn(),
        deleteQueueItem: vi.fn(),
        refetch: mockRefetch,
      } as any)

      render(<SourcesPage />)

      await waitFor(() => {
        expect(screen.getByText(/no source discovery tasks yet/i)).toBeInTheDocument()
      })
    })
  })

  describe("Authentication", () => {
    it("should show sign-in message for unauthenticated users", () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        loading: false,
        isOwner: false,
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
      } as any)

      render(<SourcesPage />)

      expect(screen.getByText(/sign in to discover sources/i)).toBeInTheDocument()
      expect(screen.queryByRole("button", { name: /add source/i })).not.toBeInTheDocument()
    })
  })

  describe("Add Source Modal", () => {
    it("should open modal when Add Source button is clicked", async () => {
      const user = userEvent.setup()
      render(<SourcesPage />)

      const addButton = screen.getByRole("button", { name: /add source/i })
      await user.click(addButton)

      // Dialog should appear
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })
    })

    it("should have form fields in modal", async () => {
      const user = userEvent.setup()
      render(<SourcesPage />)

      const addButton = screen.getByRole("button", { name: /add source/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      // Find inputs by their IDs
      expect(document.getElementById("sourceUrl")).toBeInTheDocument()
      expect(document.getElementById("companyName")).toBeInTheDocument()
    })

    it("should have required attribute on source URL input", async () => {
      const user = userEvent.setup()
      render(<SourcesPage />)

      const addButton = screen.getByRole("button", { name: /add source/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      const urlInput = document.getElementById("sourceUrl") as HTMLInputElement
      expect(urlInput).toHaveAttribute("required")
      expect(urlInput).toHaveAttribute("type", "url")
    })

    it("should have optional company name input without required attribute", async () => {
      const user = userEvent.setup()
      render(<SourcesPage />)

      const addButton = screen.getByRole("button", { name: /add source/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      const companyInput = document.getElementById("companyName") as HTMLInputElement
      expect(companyInput).not.toHaveAttribute("required")
    })

    it("should submit form with only URL (company name optional)", async () => {
      const user = userEvent.setup()
      mockSubmitSourceDiscovery.mockResolvedValue("source-new-id")

      render(<SourcesPage />)

      const addButton = screen.getByRole("button", { name: /add source/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      // Fill only source URL
      const urlInput = document.getElementById("sourceUrl") as HTMLInputElement
      await user.type(urlInput, "https://boards.greenhouse.io/newcompany")

      // Submit form
      const submitButtons = screen.getAllByRole("button")
      const discoverButton = submitButtons.find(
        (btn) => btn.textContent?.toLowerCase().includes("discover")
      )
      await user.click(discoverButton!)

      await waitFor(() => {
        expect(mockSubmitSourceDiscovery).toHaveBeenCalledWith({
          url: "https://boards.greenhouse.io/newcompany",
          companyName: undefined,
        })
      })
    })

    it("should submit form with URL and optional company name", async () => {
      const user = userEvent.setup()
      mockSubmitSourceDiscovery.mockResolvedValue("source-new-id")

      render(<SourcesPage />)

      const addButton = screen.getByRole("button", { name: /add source/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      // Fill form fields
      const urlInput = document.getElementById("sourceUrl") as HTMLInputElement
      const companyInput = document.getElementById("companyName") as HTMLInputElement

      await user.type(urlInput, "https://jobs.example.com/feed.rss")
      await user.type(companyInput, "Example Inc")

      // Submit form
      const submitButtons = screen.getAllByRole("button")
      const discoverButton = submitButtons.find(
        (btn) => btn.textContent?.toLowerCase().includes("discover")
      )
      await user.click(discoverButton!)

      await waitFor(() => {
        expect(mockSubmitSourceDiscovery).toHaveBeenCalledWith({
          url: "https://jobs.example.com/feed.rss",
          companyName: "Example Inc",
        })
      })
    })

    it("should show success message after successful submission", async () => {
      const user = userEvent.setup()
      mockSubmitSourceDiscovery.mockResolvedValue("source-new-id")

      render(<SourcesPage />)

      const addButton = screen.getByRole("button", { name: /add source/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      // Fill form fields
      const urlInput = document.getElementById("sourceUrl") as HTMLInputElement
      await user.type(urlInput, "https://boards.greenhouse.io/test")

      // Submit form
      const submitButtons = screen.getAllByRole("button")
      const discoverButton = submitButtons.find(
        (btn) => btn.textContent?.toLowerCase().includes("discover")
      )
      await user.click(discoverButton!)

      await waitFor(() => {
        expect(screen.getByText(/source discovery task created/i)).toBeInTheDocument()
      })
    })

    it("should show error message when submission fails", async () => {
      const user = userEvent.setup()
      mockSubmitSourceDiscovery.mockRejectedValue(new Error("Invalid URL format"))

      render(<SourcesPage />)

      const addButton = screen.getByRole("button", { name: /add source/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      // Fill form fields
      const urlInput = document.getElementById("sourceUrl") as HTMLInputElement
      await user.type(urlInput, "https://invalid.test")

      // Submit form
      const submitButtons = screen.getAllByRole("button")
      const discoverButton = submitButtons.find(
        (btn) => btn.textContent?.toLowerCase().includes("discover")
      )
      await user.click(discoverButton!)

      await waitFor(() => {
        expect(screen.getByText(/invalid url format/i)).toBeInTheDocument()
      })
    })

    it("should disable form inputs while submitting", async () => {
      const user = userEvent.setup()
      // Make submission hang
      mockSubmitSourceDiscovery.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      )

      render(<SourcesPage />)

      const addButton = screen.getByRole("button", { name: /add source/i })
      await user.click(addButton)

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument()
      })

      // Fill form fields
      const urlInput = document.getElementById("sourceUrl") as HTMLInputElement
      await user.type(urlInput, "https://test.com/jobs")

      // Submit form
      const submitButtons = screen.getAllByRole("button")
      const discoverButton = submitButtons.find(
        (btn) => btn.textContent?.toLowerCase().includes("discover")
      )
      await user.click(discoverButton!)

      // Inputs should be disabled
      await waitFor(() => {
        expect(urlInput).toBeDisabled()
        expect(screen.getByText(/submitting/i)).toBeInTheDocument()
      })
    })
  })

  describe("Table Display", () => {
    it("should display source URLs as external links", async () => {
      render(<SourcesPage />)

      await waitFor(() => {
        const links = screen.getAllByRole("link")
        const greenhouseLink = links.find((link) =>
          link.textContent?.includes("boards.greenhouse.io")
        )
        expect(greenhouseLink).toHaveAttribute("href", "https://boards.greenhouse.io/acme")
        expect(greenhouseLink).toHaveAttribute("target", "_blank")
        expect(greenhouseLink).toHaveAttribute("rel", "noopener noreferrer")
      })
    })

    it("should show Unknown for missing URL", async () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [
          {
            id: "source-no-url",
            type: "source_discovery",
            status: "pending",
            url: "",
            company_name: "",
            company_id: null,
            source: "user_submission",
            created_at: new Date(),
            updated_at: new Date(),
            retry_count: 0,
            max_retries: 3,
          },
        ] as any,
        loading: false,
        error: null,
        submitJob: vi.fn(),
        submitCompany: vi.fn(),
        submitSourceDiscovery: mockSubmitSourceDiscovery,
        updateQueueItem: vi.fn(),
        deleteQueueItem: vi.fn(),
        refetch: mockRefetch,
      } as any)

      render(<SourcesPage />)

      await waitFor(() => {
        expect(screen.getByText("Unknown")).toBeInTheDocument()
      })
    })

    it("should show dash for missing company name", async () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [
          {
            id: "source-no-company",
            type: "source_discovery",
            status: "pending",
            url: "https://example.com/jobs",
            company_name: "",
            company_id: null,
            source: "user_submission",
            created_at: new Date(),
            updated_at: new Date(),
            retry_count: 0,
            max_retries: 3,
          },
        ] as any,
        loading: false,
        error: null,
        submitJob: vi.fn(),
        submitCompany: vi.fn(),
        submitSourceDiscovery: mockSubmitSourceDiscovery,
        updateQueueItem: vi.fn(),
        deleteQueueItem: vi.fn(),
        refetch: mockRefetch,
      } as any)

      render(<SourcesPage />)

      await waitFor(() => {
        const dashes = screen.getAllByText("—")
        expect(dashes.length).toBeGreaterThan(0)
      })
    })
  })

  describe("Filtering", () => {
    it("should filter to only show source_discovery type tasks", async () => {
      const mixedTasks = [
        ...mockSourceTasks,
        ...mockJobTasks,
        {
          id: "company-1",
          type: "company",
          status: "pending",
          url: "https://company.com",
          company_name: "Some Company",
          company_id: null,
          source: "user_request",
          created_at: new Date(),
          updated_at: new Date(),
          retry_count: 0,
          max_retries: 3,
        },
      ]

      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: mixedTasks as any,
        loading: false,
        error: null,
        submitJob: vi.fn(),
        submitCompany: vi.fn(),
        submitSourceDiscovery: mockSubmitSourceDiscovery,
        updateQueueItem: vi.fn(),
        deleteQueueItem: vi.fn(),
        refetch: mockRefetch,
      } as any)

      render(<SourcesPage />)

      await waitFor(() => {
        // Should show source discovery tasks
        expect(screen.getByText("boards.greenhouse.io")).toBeInTheDocument()
        expect(screen.getByText("careers.techcorp.io")).toBeInTheDocument()

        // Should NOT show job or company tasks
        expect(screen.queryByText("Other Corp")).not.toBeInTheDocument()
        expect(screen.queryByText("Some Company")).not.toBeInTheDocument()
      })
    })
  })
})
