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
      user_id: "test-user-123",
      type: "linkedin-job",
      status: "pending",
      url: "https://linkedin.com/jobs/123",
      company_name: "Tech Corp",
      created_at: new Date(),
      updated_at: new Date(),
      priority: 1,
      retry_count: 0,
      source: "linkedin",
    },
    {
      id: "queue-2",
      user_id: "test-user-123",
      type: "linkedin-job",
      status: "processing",
      url: "https://linkedin.com/jobs/456",
      company_name: "StartupCo",
      created_at: new Date(),
      updated_at: new Date(),
      priority: 2,
      retry_count: 0,
      source: "linkedin",
    },
    {
      id: "queue-3",
      user_id: "test-user-123",
      type: "linkedin-job",
      status: "success",
      url: "https://linkedin.com/jobs/789",
      company_name: "BigCorp",
      created_at: new Date(),
      updated_at: new Date(),
      priority: 1,
      retry_count: 0,
      source: "linkedin",
      result_message: "Successfully processed",
    },
    {
      id: "queue-4",
      user_id: "test-user-123",
      type: "linkedin-job",
      status: "failed",
      url: "https://linkedin.com/jobs/999",
      company_name: "FailCorp",
      created_at: new Date(),
      updated_at: new Date(),
      priority: 1,
      retry_count: 3,
      source: "linkedin",
      result_message: "Failed to parse job description",
    },
  ]

  const mockUpdateQueueItem = vi.fn()

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
        expect(screen.getByText("Tech Corp")).toBeInTheDocument()
        expect(screen.getByText("StartupCo")).toBeInTheDocument()
        expect(screen.getByText("BigCorp")).toBeInTheDocument()
      })
    })

    it("should show loading state", () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [],
        loading: true,
        error: null,
        updateQueueItem: mockUpdateQueueItem,
      } as any)

      const { container } = render(<QueueManagementPage />)

      // Component shows skeleton loaders when loading - look for h-24 skeleton class pattern
      const skeletons = container.querySelectorAll('[class*="h-24"], [class*="h-32"]')
      expect(skeletons.length).toBeGreaterThan(0)
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
        // 1 pending, 1 processing, 1 success, 1 failed - there will be 4 "1"s shown
        const ones = screen.getAllByText("1")
        expect(ones.length).toBeGreaterThanOrEqual(4)
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
            user_id: "test-user-123",
            type: "linkedin-job",
            status: "pending",
            url: "https://linkedin.com/jobs/111",
            company_name: "NewCorp",
            created_at: new Date(),
            updated_at: new Date(),
            priority: 1,
            retry_count: 0,
            source: "linkedin",
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
    it("should have status filter select", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument()
      })

      // Verify the status filter label exists
      expect(screen.getByText(/status:/i)).toBeInTheDocument()
      // Verify a combobox exists for status filtering
      const comboboxes = screen.getAllByRole("combobox")
      expect(comboboxes.length).toBeGreaterThan(0)
    })

    it("should search by company name", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search/i)
      await user.type(searchInput, "BigCorp")

      await waitFor(() => {
        expect(screen.getByText("BigCorp")).toBeInTheDocument()
        expect(screen.queryByText("Tech Corp")).not.toBeInTheDocument()
      })
    })

    it("should search by URL", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText(/search/i)
      await user.type(searchInput, "jobs/123")

      await waitFor(() => {
        expect(screen.getByText("Tech Corp")).toBeInTheDocument()
        expect(screen.queryByText("StartupCo")).not.toBeInTheDocument()
      })
    })
  })

  describe("Authorization", () => {
    it("should show sign-in message for unauthenticated users", () => {
      vi.mocked(useAuth).mockReturnValue({
        user: null,
        loading: false,
        isOwner: false,
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
      } as any)

      render(<QueueManagementPage />)

      expect(screen.getByText(/sign in/i)).toBeInTheDocument()
    })

    it("should show permission error for non-editors", () => {
      vi.mocked(useAuth).mockReturnValue({
        user: mockUser as any,
        loading: false,
        isOwner: false,
        signOut: vi.fn(),
        signInWithGoogle: vi.fn(),
      } as any)

      render(<QueueManagementPage />)

      expect(screen.getByText(/editor permissions/i)).toBeInTheDocument()
    })
  })

  describe("Error Handling", () => {
    it("should handle empty queue gracefully", () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [],
        loading: false,
        error: null,
        updateQueueItem: mockUpdateQueueItem,
      } as any)

      render(<QueueManagementPage />)

      // Should show an empty state - "The queue is empty."
      expect(screen.getByText(/the queue is empty/i)).toBeInTheDocument()
    })
  })

  describe("Tab Navigation", () => {
    it("should render Queue Items tab", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /queue items/i })).toBeInTheDocument()
      })
    })

    it("should render Filters & Search tab", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /filters/i })).toBeInTheDocument()
      })
    })

    it("should switch between tabs", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByRole("tab", { name: /filters/i })).toBeInTheDocument()
      })

      const filtersTab = screen.getByRole("tab", { name: /filters/i })
      await user.click(filtersTab)

      // Should show filters content
      await waitFor(() => {
        expect(filtersTab).toHaveAttribute("data-state", "active")
      })
    })
  })

  describe("Live Badge", () => {
    it("should show Live badge when data is loaded", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Live")).toBeInTheDocument()
      })
    })
  })
})
