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
import { configClient } from "@/api/config-client"
import { queueClient } from "@/api/queue-client"

vi.mock("@/contexts/AuthContext")
vi.mock("@/hooks/useQueueItems")
vi.mock("@/api/config-client", () => ({
  configClient: {
    getQueueSettings: vi.fn(),
    updateQueueSettings: vi.fn(),
  },
}))
vi.mock("@/api/queue-client", () => ({
  queueClient: {
    getStats: vi.fn(),
  },
}))

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
      connectionStatus: "connected",
      eventLog: [],
      updateQueueItem: mockUpdateQueueItem,
      refetch: vi.fn(),
    } as any)

    // Default: queue processing is enabled
    vi.mocked(configClient.getQueueSettings).mockResolvedValue({
      processingTimeoutSeconds: 1800,
      isProcessingEnabled: true,
    })
    vi.mocked(configClient.updateQueueSettings).mockResolvedValue()

    // Mock queue stats API
    vi.mocked(queueClient.getStats).mockResolvedValue({
      total: 4,
      pending: 1,
      processing: 1,
      success: 1,
      failed: 1,
      skipped: 0,
      filtered: 0,
    })
  })

  describe("Initial Rendering", () => {
    it("renders the queue management page", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText(/queue management/i)).toBeInTheDocument()
      })
    })

    it("displays pending queue items in the pending tab", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        // Pending tab shows pending and processing items
        expect(screen.getByTestId("queue-item-queue-1")).toBeInTheDocument()
        expect(screen.getByTestId("queue-item-queue-2")).toBeInTheDocument()
        // Success and failed items are in the completed tab, not visible by default
        expect(screen.queryByTestId("queue-item-queue-3")).not.toBeInTheDocument()
        expect(screen.queryByTestId("queue-item-queue-4")).not.toBeInTheDocument()
      })
    })

    it("shows loading state", () => {
      vi.mocked(useQueueItems).mockReturnValue({
        queueItems: [],
        loading: true,
        error: null,
        connectionStatus: "connecting",
        eventLog: [],
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
        connectionStatus: "disconnected",
        eventLog: [],
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

    it("updates stats when API returns new counts", async () => {
      const { rerender } = render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("4")).toBeInTheDocument()
      })

      // Update the stats API mock to return new count
      vi.mocked(queueClient.getStats).mockResolvedValue({
        total: 5,
        pending: 2,
        processing: 1,
        success: 1,
        failed: 1,
        skipped: 0,
        filtered: 0,
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
        connectionStatus: "connected",
        eventLog: [],
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
        connectionStatus: "connected",
        eventLog: [],
        updateQueueItem: mockUpdateQueueItem,
        refetch: vi.fn(),
      } as any)

      render(<QueueManagementPage />)

      // With tabs, empty pending tab shows "no pending tasks"
      expect(screen.getByText(/no pending tasks/i)).toBeInTheDocument()
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
    it("shows Live badge when processing is enabled", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Live")).toBeInTheDocument()
      })
    })

    it("shows Paused badge when processing is disabled", async () => {
      vi.mocked(configClient.getQueueSettings).mockResolvedValue({
        processingTimeoutSeconds: 1800,
        isProcessingEnabled: false,
      })

      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Paused")).toBeInTheDocument()
      })
    })
  })

  describe("Queue Processing Toggle", () => {
    it("shows Pause Queue button when processing is enabled", async () => {
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pause queue/i })).toBeInTheDocument()
      })
    })

    it("shows Start Queue button when processing is disabled", async () => {
      vi.mocked(configClient.getQueueSettings).mockResolvedValue({
        processingTimeoutSeconds: 1800,
        isProcessingEnabled: false,
      })

      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /start queue/i })).toBeInTheDocument()
      })
    })

    it("opens confirmation modal when Pause Queue is clicked", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pause queue/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /pause queue/i }))

      await waitFor(() => {
        expect(screen.getByText(/pause queue processing\?/i)).toBeInTheDocument()
        expect(screen.getByText(/stop picking up new tasks/i)).toBeInTheDocument()
      })
    })

    it("opens confirmation modal when Start Queue is clicked", async () => {
      vi.mocked(configClient.getQueueSettings).mockResolvedValue({
        processingTimeoutSeconds: 1800,
        isProcessingEnabled: false,
      })

      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /start queue/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /start queue/i }))

      await waitFor(() => {
        expect(screen.getByText(/start queue processing\?/i)).toBeInTheDocument()
        expect(screen.getByText(/resume processing pending items/i)).toBeInTheDocument()
      })
    })

    it("closes confirmation modal when Cancel is clicked", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pause queue/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /pause queue/i }))

      await waitFor(() => {
        expect(screen.getByText(/pause queue processing\?/i)).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /^cancel$/i }))

      await waitFor(() => {
        expect(screen.queryByText(/pause queue processing\?/i)).not.toBeInTheDocument()
      })
    })

    it("pauses processing when confirmed", async () => {
      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pause queue/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /pause queue/i }))

      await waitFor(() => {
        expect(screen.getByText(/pause queue processing\?/i)).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /pause processing/i }))

      await waitFor(() => {
        expect(configClient.updateQueueSettings).toHaveBeenCalledWith({
          isProcessingEnabled: false,
        })
      })

      await waitFor(() => {
        expect(screen.getByText(/queue processing paused/i)).toBeInTheDocument()
      })
    })

    it("starts processing when confirmed", async () => {
      vi.mocked(configClient.getQueueSettings).mockResolvedValue({
        processingTimeoutSeconds: 1800,
        isProcessingEnabled: false,
      })

      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /start queue/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /start queue/i }))

      await waitFor(() => {
        expect(screen.getByText(/start queue processing\?/i)).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /start processing/i }))

      await waitFor(() => {
        expect(configClient.updateQueueSettings).toHaveBeenCalledWith({
          isProcessingEnabled: true,
        })
      })

      await waitFor(() => {
        expect(screen.getByText(/queue processing started/i)).toBeInTheDocument()
      })
    })

    it("shows error message when toggle fails", async () => {
      vi.mocked(configClient.updateQueueSettings).mockRejectedValue(new Error("Network error"))

      const user = userEvent.setup()
      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /pause queue/i })).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /pause queue/i }))

      await waitFor(() => {
        expect(screen.getByText(/pause queue processing\?/i)).toBeInTheDocument()
      })

      await user.click(screen.getByRole("button", { name: /pause processing/i }))

      await waitFor(() => {
        expect(screen.getByText(/failed to update queue processing state/i)).toBeInTheDocument()
      })
    })

    it("defaults to enabled when getQueueSettings fails", async () => {
      vi.mocked(configClient.getQueueSettings).mockRejectedValue(new Error("Failed to load"))

      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Live")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /pause queue/i })).toBeInTheDocument()
      })
    })

    it("defaults to enabled when isProcessingEnabled is not set", async () => {
      vi.mocked(configClient.getQueueSettings).mockResolvedValue({
        processingTimeoutSeconds: 1800,
      } as any)

      render(<QueueManagementPage />)

      await waitFor(() => {
        expect(screen.getByText("Live")).toBeInTheDocument()
        expect(screen.getByRole("button", { name: /pause queue/i })).toBeInTheDocument()
      })
    })
  })
})
