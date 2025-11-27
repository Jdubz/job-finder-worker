/**
 * Queue Management Page Tests
 *
 * Focuses on the streamlined queue list, stats, and detail modal.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { QueueManagementPage } from "../QueueManagementPage"
import { useAuth } from "@/contexts/AuthContext"
import { useQueueItems } from "@/hooks/useQueueItems"

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
      type: "job",
      status: "pending",
      url: "https://linkedin.com/jobs/123",
      company_name: "Tech Corp",
      created_at: new Date(),
      updated_at: new Date(),
      source: "linkedin",
    },
    {
      id: "queue-2",
      user_id: "test-user-123",
      type: "job",
      status: "processing",
      url: "https://linkedin.com/jobs/456",
      company_name: "StartupCo",
      created_at: new Date(),
      updated_at: new Date(),
      source: "linkedin",
    },
    {
      id: "queue-3",
      user_id: "test-user-123",
      type: "job",
      status: "success",
      url: "https://linkedin.com/jobs/789",
      company_name: "BigCorp",
      created_at: new Date(),
      updated_at: new Date(),
      source: "linkedin",
      result_message: "Successfully processed",
    },
    {
      id: "queue-4",
      user_id: "test-user-123",
      type: "job",
      status: "failed",
      url: "https://linkedin.com/jobs/999",
      company_name: "FailCorp",
      created_at: new Date(),
      updated_at: new Date(),
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
      refetch: vi.fn(),
    } as any)
  })

  describe("Initial Rendering", () => {
    it("renders the queue management page", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText(/queue management/i)).toBeInTheDocument()
      })
    })

    it("displays queue items in the list", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByTestId("queue-item-queue-1")).toBeInTheDocument()
        expect(screen.getByTestId("queue-item-queue-2")).toBeInTheDocument()
        expect(screen.getByTestId("queue-item-queue-3")).toBeInTheDocument()
      })
    })

    it("shows loading state", () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [],
        loading: true,
        error: null,
        updateQueueItem: mockUpdateQueueItem,
        refetch: vi.fn(),
      } as any)

      render(<QueueManagementPage />)

      expect(screen.getByRole("heading", { name: /queue management/i })).toBeInTheDocument()
      expect(document.querySelector(".animate-spin")).toBeTruthy()
    })

    it("shows error state", async () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [],
        loading: false,
        error: new Error("Failed to load"),
        updateQueueItem: mockUpdateQueueItem,
        refetch: vi.fn(),
      } as any)

      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
      })
    })
  })

  describe("Queue Stats", () => {
    it("displays queue statistics", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText(/total/i)).toBeInTheDocument()
        expect(screen.getByText("4")).toBeInTheDocument()
      })
    })

    it("updates stats when items change", async () => {
      const { rerender } = render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("4")).toBeInTheDocument()
      })

      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [
          ...mockQueueItems,
          {
            id: "queue-5",
            user_id: "test-user-123",
            type: "job",
            status: "pending",
            url: "https://linkedin.com/jobs/111",
            company_name: "NewCorp",
            created_at: new Date(),
            updated_at: new Date(),
            source: "linkedin",
          },
        ] as any,
        loading: false,
        error: null,
        updateQueueItem: mockUpdateQueueItem,
        refetch: vi.fn(),
      } as any)

      rerender(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("5")).toBeInTheDocument()
      })
    })
  })

  describe("Authorization", () => {
    it("shows sign-in message for unauthenticated users", () => {
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

    it("shows permission error for non-editors", () => {
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

  describe("Empty State", () => {
    it("handles empty queue gracefully", () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [],
        loading: false,
        error: null,
        updateQueueItem: mockUpdateQueueItem,
        refetch: vi.fn(),
      } as any)

      render(<QueueManagementPage />)

      expect(screen.getByText(/the queue is empty/i)).toBeInTheDocument()
    })
  })

  describe("Details Modal", () => {
    it("opens when a row is clicked", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByTestId("queue-item-queue-1")).toBeInTheDocument()
      })

      await user.click(screen.getByTestId("queue-item-queue-1"))

      await waitFor(() => {
        expect(screen.getByText(/queue item details/i)).toBeInTheDocument()
      })
    })
  })

  describe("Live Badge", () => {
    it("shows Live badge when data is loaded", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Live")).toBeInTheDocument()
      })
    })
  })
})
