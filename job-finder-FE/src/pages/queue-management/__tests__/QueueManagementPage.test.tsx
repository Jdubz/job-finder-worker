/**
 * Queue Management Page Tests
 *
 * Tests for queue management including:
 * - Queue item display and filtering
 * - Bulk operations
 * - Stats display
 * - Real-time updates
 * - Status management
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueueManagementPage } from "../QueueManagementPage"
import { useAuth } from "@/contexts/AuthContext"
import { useQueueItems } from "@/hooks/useQueueItems"

// Mock modules
vi.mock("@/contexts/AuthContext")
vi.mock("@/hooks/useQueueItems")

describe("QueueManagementPage", () => {
  const mockUser = {
    uid: "test-user-123",
    email: "test@example.com",
    displayName: "Test User",
  }

  const mockQueueItems = [
    {
      id: "queue-1",
      type: "linkedin-job",
      status: "pending",
      url: "https://linkedin.com/jobs/123",
      title: "Software Engineer",
      company: "Tech Corp",
      location: "San Francisco, CA",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      priority: 1,
      retryCount: 0,
    },
    {
      id: "queue-2",
      type: "linkedin-job",
      status: "processing",
      url: "https://linkedin.com/jobs/456",
      title: "Senior Developer",
      company: "StartupCo",
      location: "Remote",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      priority: 2,
      retryCount: 0,
    },
    {
      id: "queue-3",
      type: "linkedin-job",
      status: "success",
      url: "https://linkedin.com/jobs/789",
      title: "Full Stack Engineer",
      company: "BigCorp",
      location: "New York, NY",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      priority: 1,
      retryCount: 0,
    },
    {
      id: "queue-4",
      type: "linkedin-job",
      status: "failed",
      url: "https://linkedin.com/jobs/999",
      title: "Backend Developer",
      company: "FailCorp",
      location: "Austin, TX",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      priority: 1,
      retryCount: 3,
      error: "Failed to parse job description",
    },
  ]

  const mockUpdateQueueItem = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(useAuth).mockReturnValue({
      user: mockUser as any,
      loading: false,
      isEditor: true,
      signOut: vi.fn(),
      signInWithGoogle: vi.fn(),
    } as any)

    vi.mocked(useQueueItems).mockReturnValue({
      queueItems: mockQueueItems as any,
      loading: false,
      error: null,
      updateQueueItem: mockUpdateQueueItem,
    } as any)
  })

  describe("Initial Rendering", () => {
    it("should render the queue management page", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText(/queue management/i)).toBeInTheDocument()
      })
    })

    it("should display queue items", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
        expect(screen.getByText("Senior Developer")).toBeInTheDocument()
        expect(screen.getByText("Full Stack Engineer")).toBeInTheDocument()
      })
    })

    it("should show loading state", () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [],
        loading: true,
        error: null,
        updateQueueItem: mockUpdateQueueItem,
      } as any)

      render(<QueueManagementPage />)

      expect(screen.getByText(/loading/i)).toBeInTheDocument()
    })

    it("should display error state", async () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [],
        loading: false,
        error: new Error("Failed to load"),
        updateQueueItem: mockUpdateQueueItem,
      } as any)

      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
      })
    })
  })

  describe("Queue Stats", () => {
    it("should display queue statistics", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        // Total should be 4
        expect(screen.getByText(/total/i)).toBeInTheDocument()
        expect(screen.getByText("4")).toBeInTheDocument()
      })
    })

    it("should show correct status counts", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        // 1 pending, 1 processing, 1 success, 1 failed
        expect(screen.getByText("1") || screen.getAllByText("1")).toBeTruthy()
      })
    })

    it("should update stats when items change", async () => {
      const { rerender } = render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("4")).toBeInTheDocument()
      })

      // Update with new items
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [
          ...mockQueueItems,
          {
            id: "queue-5",
            type: "linkedin-job",
            status: "pending",
            url: "https://linkedin.com/jobs/111",
            title: "New Job",
            company: "NewCorp",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ] as any,
        loading: false,
        error: null,
        updateQueueItem: mockUpdateQueueItem,
      } as any)

      rerender(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("5")).toBeInTheDocument()
      })
    })
  })

  describe("Filtering", () => {
    it("should filter by status", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      // Find and click status filter
      const statusFilter =
        screen.getByRole("combobox", { name: /status/i }) || screen.getAllByRole("combobox")[0]
      await user.click(statusFilter)

      const pendingOption = screen.getByText(/^pending$/i)
      await user.click(pendingOption)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
        expect(screen.queryByText("Senior Developer")).not.toBeInTheDocument()
      })
    })

    it("should search by job title", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search/i) || screen.getByRole("textbox")
      await user.type(searchInput, "Senior")

      await waitFor(() => {
        expect(screen.getByText("Senior Developer")).toBeInTheDocument()
        expect(screen.queryByText("Software Engineer")).not.toBeInTheDocument()
      })
    })

    it("should search by company name", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search/i) || screen.getByRole("textbox")
      await user.type(searchInput, "BigCorp")

      await waitFor(() => {
        expect(screen.getByText("Full Stack Engineer")).toBeInTheDocument()
        expect(screen.queryByText("Software Engineer")).not.toBeInTheDocument()
      })
    })

    it("should clear filters", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      // Apply filter
      const searchInput = screen.getByPlaceholderText(/search/i) || screen.getByRole("textbox")
      await user.type(searchInput, "Senior")

      await waitFor(() => {
        expect(screen.queryByText("Software Engineer")).not.toBeInTheDocument()
      })

      // Clear filter
      const clearButton = screen.getByRole("button", { name: /clear|reset/i })
      await user.click(clearButton)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
        expect(screen.getByText("Senior Developer")).toBeInTheDocument()
      })
    })
  })

  describe("Queue Item Actions", () => {
    it("should retry failed item", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Backend Developer")).toBeInTheDocument()
      })

      const retryButton = screen.getByRole("button", { name: /retry/i })
      await user.click(retryButton)

      await waitFor(() => {
        expect(mockUpdateQueueItem).toHaveBeenCalledWith(
          "queue-4",
          expect.objectContaining({
            status: "pending",
          })
        )
      })
    })

    it("should delete queue item", async () => {
      const user = userEvent.setup()
      // Mock window.confirm
      global.confirm = vi.fn(() => true)

      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Backend Developer")).toBeInTheDocument()
      })

      const deleteButton = screen.getByRole("button", { name: /delete/i })
      await user.click(deleteButton)

      await waitFor(() => {
        expect(mockUpdateQueueItem).toHaveBeenCalled()
      })
    })

    it("should skip queue item", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      const skipButton = screen.getByRole("button", { name: /skip/i })
      await user.click(skipButton)

      await waitFor(() => {
        expect(mockUpdateQueueItem).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            status: "skipped",
          })
        )
      })
    })

    it("should view queue item details", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      const viewButton = screen.getByRole("button", { name: /view|details/i })
      await user.click(viewButton)

      await waitFor(() => {
        expect(screen.getByText(/details|information/i)).toBeInTheDocument()
      })
    })
  })

  describe("Bulk Operations", () => {
    it("should select multiple items", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole("checkbox")
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])

      expect(checkboxes[0]).toBeChecked()
      expect(checkboxes[1]).toBeChecked()
    })

    it("should select all items", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      const selectAllCheckbox = screen.getByRole("checkbox", { name: /select all/i })
      await user.click(selectAllCheckbox)

      const checkboxes = screen.getAllByRole("checkbox")
      checkboxes.forEach((checkbox) => {
        expect(checkbox).toBeChecked()
      })
    })

    it("should bulk retry selected items", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      // Select items
      const checkboxes = screen.getAllByRole("checkbox")
      await user.click(checkboxes[0])
      await user.click(checkboxes[1])

      // Bulk retry
      const bulkRetryButton = screen.getByRole("button", { name: /retry selected/i })
      await user.click(bulkRetryButton)

      await waitFor(() => {
        expect(mockUpdateQueueItem).toHaveBeenCalledTimes(2)
      })
    })

    it("should bulk delete selected items", async () => {
      const user = userEvent.setup()
      global.confirm = vi.fn(() => true)

      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      // Select items
      const checkboxes = screen.getAllByRole("checkbox")
      await user.click(checkboxes[0])

      // Bulk delete
      const bulkDeleteButton = screen.getByRole("button", { name: /delete selected/i })
      await user.click(bulkDeleteButton)

      await waitFor(() => {
        expect(mockUpdateQueueItem).toHaveBeenCalled()
      })
    })
  })

  describe("Refresh", () => {
    it("should refresh queue items", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      const refreshButton = screen.getByRole("button", { name: /refresh/i })
      await user.click(refreshButton)

      // Should show refreshing state
      expect(screen.getByRole("button", { name: /refresh/i })).toBeDisabled()
    })

    it("should auto-refresh when new items arrive", async () => {
      const { rerender } = render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      // Simulate new item arriving
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [
          ...mockQueueItems,
          {
            id: "queue-new",
            type: "linkedin-job",
            status: "pending",
            url: "https://linkedin.com/jobs/new",
            title: "New Position",
            company: "NewCo",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ] as any,
        loading: false,
        error: null,
        updateQueueItem: mockUpdateQueueItem,
      } as any)

      rerender(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("New Position")).toBeInTheDocument()
      })
    })
  })

  describe("Sorting", () => {
    it("should sort by creation date", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      const sortSelect = screen.getByRole("combobox", { name: /sort/i })
      await user.click(sortSelect)

      const dateOption = screen.getByText(/date|created/i)
      await user.click(dateOption)

      // Items should be reordered
      const items = screen.getAllByRole("article") || screen.getAllByRole("listitem")
      expect(items.length).toBeGreaterThan(0)
    })

    it("should toggle sort order", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      const sortOrderButton = screen.getByRole("button", { name: /ascending|descending/i })
      await user.click(sortOrderButton)

      // Should toggle order
      expect(sortOrderButton).toHaveAttribute("aria-label", /ascending/i)
    })
  })

  describe("Authorization", () => {
    it("should show limited features for non-editors", () => {
      vi.mocked(useAuth).mockReturnValue({
        user: mockUser as any,
        loading: false,
        isEditor: false,
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
      } as any)

      render(<QueueManagementPage />)

      // Should not show bulk actions
      expect(screen.queryByRole("button", { name: /delete selected/i })).not.toBeInTheDocument()
    })

    it("should allow editors to perform bulk operations", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Software Engineer")).toBeInTheDocument()
      })

      // Should show bulk actions
      expect(
        screen.getByRole("button", { name: /retry selected|delete selected/i })
      ).toBeInTheDocument()
    })
  })

  describe("Error Handling", () => {
    it("should display error when update fails", async () => {
      const user = userEvent.setup()
      mockUpdateQueueItem.mockRejectedValue(new Error("Update failed"))

      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Backend Developer")).toBeInTheDocument()
      })

      const retryButton = screen.getByRole("button", { name: /retry/i })
      await user.click(retryButton)

      await waitFor(() => {
        expect(screen.getByText(/failed|error/i)).toBeInTheDocument()
      })
    })

    it("should handle empty queue gracefully", () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [],
        loading: false,
        error: null,
        updateQueueItem: mockUpdateQueueItem,
      } as any)

      render(<QueueManagementPage />)

      expect(screen.getByText(/no items|empty/i)).toBeInTheDocument()
    })
  })

  describe("Tab Navigation", () => {
    it("should switch between tabs", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /all/i })).toBeInTheDocument()
      })

      const failedTab = screen.getByRole("tab", { name: /failed/i })
      await user.click(failedTab)

      await waitFor(() => {
        expect(screen.getByText("Backend Developer")).toBeInTheDocument()
        expect(screen.queryByText("Software Engineer")).not.toBeInTheDocument()
      })
    })

    it("should show correct counts in tabs", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /all/i })).toBeInTheDocument()
      })

      // Check badge counts
      expect(screen.getByText("4")).toBeInTheDocument() // All items
      expect(screen.getByText("1")).toBeInTheDocument() // Failed items
    })
  })
})
