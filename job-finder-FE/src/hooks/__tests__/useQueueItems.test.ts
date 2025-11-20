import { renderHook, act, waitFor } from "@testing-library/react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useQueueItems } from "../useQueueItems"

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}))

vi.mock("@/api", () => ({
  queueClient: {
    listQueueItems: vi.fn(),
    submitJob: vi.fn(),
    updateQueueItem: vi.fn(),
    deleteQueueItem: vi.fn(),
  },
}))

const { useAuth } = await import("@/contexts/AuthContext")
const { queueClient } = await import("@/api")

describe("useQueueItems", () => {
  const mockUser = { id: "user-123", uid: "user-123", email: "user@example.com" }
  const mockQueueItems = [
    {
      id: "queue-1",
      type: "job",
      status: "pending",
      url: "https://example.com",
      company_name: "ExampleCo",
      company_id: null,
      source: "user_submission",
      submitted_by: "user-123",
      retry_count: 0,
      max_retries: 3,
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any)
    vi.mocked(queueClient.listQueueItems).mockResolvedValue({
      items: mockQueueItems as any,
      pagination: { limit: 50, offset: 0, total: mockQueueItems.length, hasMore: false },
    })
    vi.mocked(queueClient.submitJob).mockResolvedValue(mockQueueItems[0] as any)
    vi.mocked(queueClient.updateQueueItem).mockResolvedValue(mockQueueItems[0] as any)
  })

  it("fetches queue items on mount", async () => {
    const { result } = renderHook(() => useQueueItems())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(queueClient.listQueueItems).toHaveBeenCalled()
    expect(result.current.queueItems).toHaveLength(1)
  })

  it("handles fetch errors", async () => {
    const error = new Error("Failed to load queue")
    vi.mocked(queueClient.listQueueItems).mockRejectedValueOnce(error)

    const { result } = renderHook(() => useQueueItems())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe(error)
    expect(result.current.queueItems).toEqual([])
  })

  it("submits queue items", async () => {
    const { result } = renderHook(() => useQueueItems())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.submitJob("https://example.com")
    })

    expect(queueClient.submitJob).toHaveBeenCalled()
  })

  it("updates queue items", async () => {
    const { result } = renderHook(() => useQueueItems())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateQueueItem("queue-1", { status: "success" } as any)
    })

    expect(queueClient.updateQueueItem).toHaveBeenCalledWith(
      "queue-1",
      expect.objectContaining({ status: "success" })
    )
  })

  it("deletes queue items", async () => {
    const { result } = renderHook(() => useQueueItems())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteQueueItem("queue-1")
    })

    expect(queueClient.deleteQueueItem).toHaveBeenCalledWith("queue-1")
  })
})
