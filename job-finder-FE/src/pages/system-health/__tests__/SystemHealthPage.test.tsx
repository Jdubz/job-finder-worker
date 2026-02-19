import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { SystemHealthPage } from "../SystemHealthPage"

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "user-123", email: "admin@example.com" },
    isOwner: true,
  })),
}))

vi.mock("@/api/queue-client", () => ({
  queueClient: {
    getCronStatus: vi.fn().mockResolvedValue({
      started: true,
      nodeEnv: "production",
      timezone: "UTC",
      jobs: {
        scrape: { enabled: true, hours: [8, 12, 16], lastRun: new Date().toISOString() },
        maintenance: { enabled: true, hours: [0], lastRun: new Date().toISOString() },
        logrotate: { enabled: false, hours: [4], lastRun: null },
        agentReset: { enabled: true, hours: [6], lastRun: null },
      },
    }),
    getWorkerHealth: vi.fn().mockResolvedValue({
      reachable: true,
      workerUrl: "http://localhost:8001",
      health: {
        status: "healthy",
        running: true,
        items_processed: 42,
        iteration: 100,
        last_poll: new Date().toISOString(),
        last_error: null,
      },
      status: {
        uptime: 3600,
        queue: { pending: 5, processing: 1 },
      },
    }),
    getAgentCliHealth: vi.fn().mockResolvedValue({
      backend: {
        claude: { healthy: true, message: "OAuth token valid" },
      },
      worker: {
        reachable: true,
        workerUrl: "http://localhost:8001",
        providers: {
          claude: { healthy: true, message: "CLI ready" },
          gemini: { healthy: true, message: "API key valid" },
        },
      },
    }),
    triggerCronScrape: vi.fn().mockResolvedValue({ success: true, queueItemId: "123" }),
    triggerCronMaintenance: vi.fn().mockResolvedValue({ success: true }),
    triggerCronLogrotate: vi.fn().mockResolvedValue({ success: true }),
  },
}))

vi.mock("@/api/config-client", () => ({
  configClient: {
    getCronConfig: vi.fn().mockResolvedValue(null),
    updateCronConfig: vi.fn().mockResolvedValue({}),
  },
}))

import { useAuth } from "@/contexts/AuthContext"
import { queueClient } from "@/api/queue-client"

describe("SystemHealthPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-123", email: "admin@example.com" },
      isOwner: true,
    } as unknown as ReturnType<typeof useAuth>)
  })

  it("requires authentication", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isOwner: false,
    } as unknown as ReturnType<typeof useAuth>)

    render(<SystemHealthPage />)
    expect(screen.getByText("Please sign in to view system health.")).toBeInTheDocument()
  })

  it("requires admin access", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "user-123", email: "user@example.com" },
      isOwner: false,
    } as unknown as ReturnType<typeof useAuth>)

    render(<SystemHealthPage />)
    expect(screen.getByText("Admin access required to view system health.")).toBeInTheDocument()
  })

  it("renders page title for admins", async () => {
    render(<SystemHealthPage />)
    expect(screen.getByText("System Health")).toBeInTheDocument()
    expect(screen.getByText("Monitor cron scheduler, worker, and agent CLI status")).toBeInTheDocument()
  })

  it("fetches health data on mount", async () => {
    render(<SystemHealthPage />)

    await waitFor(() => {
      expect(queueClient.getCronStatus).toHaveBeenCalled()
      expect(queueClient.getWorkerHealth).toHaveBeenCalled()
      expect(queueClient.getAgentCliHealth).toHaveBeenCalled()
    })
  })

  it("displays cron scheduler status", async () => {
    render(<SystemHealthPage />)

    await waitFor(() => {
      expect(screen.getByText("Cron Scheduler")).toBeInTheDocument()
      // Multiple "Running" badges may appear (cron + worker)
      expect(screen.getAllByText("Running").length).toBeGreaterThan(0)
    })

    expect(screen.getByText("production")).toBeInTheDocument()
  })

  it("displays worker health status", async () => {
    render(<SystemHealthPage />)

    // Wait for Worker card title to appear (always rendered)
    await waitFor(() => {
      expect(screen.getByText("Worker")).toBeInTheDocument()
    })

    // Wait for the Running badge to appear after data loads
    await waitFor(
      () => {
        // At least one "Running" badge should appear (cron and/or worker)
        expect(screen.getAllByText("Running").length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
  })

  it("displays agent CLI status", async () => {
    render(<SystemHealthPage />)

    await waitFor(() => {
      expect(screen.getByText("Agent CLI Tools")).toBeInTheDocument()
      expect(screen.getByText("Healthy")).toBeInTheDocument()
    })
  })

  it("renders refresh button", async () => {
    render(<SystemHealthPage />)

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Refresh/i })).toBeInTheDocument()
    })
  })

  it("displays cron job controls", async () => {
    render(<SystemHealthPage />)

    await waitFor(() => {
      expect(screen.getByText("Scrape Jobs")).toBeInTheDocument()
      expect(screen.getByText("Maintenance")).toBeInTheDocument()
      expect(screen.getByText("Log Rotation")).toBeInTheDocument()
    })
  })

  it("displays worker queue stats when available", async () => {
    render(<SystemHealthPage />)

    await waitFor(() => {
      expect(screen.getByText("Queue Stats")).toBeInTheDocument()
    })
  })
})
