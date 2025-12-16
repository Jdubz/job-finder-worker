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
    submitCompany: vi.fn(),
    updateQueueItem: vi.fn(),
    deleteQueueItem: vi.fn(),
    submitSourceDiscovery: vi.fn(),
    submitSourceRecover: vi.fn(),
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
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useAuth).mockReturnValue({ user: mockUser } as any)
    vi.mocked(queueClient.listQueueItems).mockImplementation(async (params?: any) => {
      const status = params?.status
      const type = params?.type
      const filtered = mockQueueItems.filter((item) => {
        const statusMatch = !status
          || (Array.isArray(status) ? status.includes(item.status) : item.status === status)
        const typeMatch = type ? item.type === type : true
        return statusMatch && typeMatch
      })
      return {
        items: filtered as any,
        pagination: { limit: params?.limit ?? 50, offset: 0, total: filtered.length, hasMore: false },
      }
    })
    vi.mocked(queueClient.submitJob).mockResolvedValue(mockQueueItems[0] as any)
    vi.mocked(queueClient.submitSourceDiscovery).mockResolvedValue(mockQueueItems[0] as any)
    vi.mocked(queueClient.updateQueueItem).mockResolvedValue(mockQueueItems[0] as any)
  })

  it("does not add submitted items that fail type filter", async () => {
    const filteredItem = { ...mockQueueItems[0], type: "job" }
    vi.mocked(queueClient.submitSourceDiscovery).mockResolvedValue(filteredItem as any)

    const { result } = renderHook(() => useQueueItems({ type: "company" }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const initial = result.current.queueItems.length
    await act(async () => {
      await result.current.submitSourceDiscovery({ url: "https://example.com" })
    })

    expect(result.current.queueItems.length).toBe(initial)
  })

  it("fetches queue items on mount", async () => {
    const { result } = renderHook(() => useQueueItems())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(queueClient.listQueueItems).toHaveBeenCalled()
    expect(result.current.queueItems).toHaveLength(1)
  })

  it("handles fetch errors", async () => {
    const error = new Error("Failed to load queue")
    // Mock all calls to reject (the hook retries after SSE failure)
    vi.mocked(queueClient.listQueueItems).mockRejectedValue(error)

    const { result } = renderHook(() => useQueueItems())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toEqual(error)
    expect(result.current.queueItems).toEqual([])
  })

  it("submits queue items", async () => {
    const { result } = renderHook(() => useQueueItems())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.submitJob({ url: "https://example.com" } as any)
    })

    expect(queueClient.submitJob).toHaveBeenCalledWith({
      url: "https://example.com",
      source: "user_submission",
      metadata: {},
    })
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

  it("does not add submitted items that fail filters", async () => {
    const filteredItem = { ...mockQueueItems[0], status: "pending" }
    vi.mocked(queueClient.submitJob).mockResolvedValue(filteredItem as any)

    const { result } = renderHook(() => useQueueItems({ status: "completed" }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    const initial = result.current.queueItems.length
    await act(async () => {
      await result.current.submitJob({ url: "https://example.com" } as any)
    })

    expect(result.current.queueItems.length).toBe(initial)
  })

  it("filters updates that no longer match status", async () => {
    const { result } = renderHook(() => useQueueItems({ status: "pending" }))
    await waitFor(() => expect(result.current.loading).toBe(false))

    vi.mocked(queueClient.updateQueueItem).mockResolvedValue({
      ...mockQueueItems[0],
      status: "completed",
    } as any)

    await act(async () => {
      await result.current.updateQueueItem("queue-1", { status: "completed" } as any)
    })

    expect(result.current.queueItems.find((i) => i.id === "queue-1")).toBeUndefined()
  })

  describe("submitCompany", () => {
    const mockCompanyQueueItem = {
      id: "queue-company-1",
      type: "company",
      status: "pending",
      url: "https://example.com",
      company_name: "ExampleCo",
      company_id: null,
      source: "user_request",
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    }

    beforeEach(() => {
      vi.mocked(queueClient.submitCompany).mockResolvedValue(mockCompanyQueueItem as any)
    })

    it("submits company without companyId for new companies", async () => {
      const { result } = renderHook(() => useQueueItems())
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.submitCompany({
          companyName: "ExampleCo",
          websiteUrl: "https://example.com",
          allowReanalysis: false,
        })
      })

      expect(queueClient.submitCompany).toHaveBeenCalledWith({
        companyName: "ExampleCo",
        websiteUrl: "https://example.com",
        companyId: undefined,
        source: "user_request",
        allowReanalysis: false,
      })
    })

    it("submits company with companyId for re-analysis", async () => {
      const { result } = renderHook(() => useQueueItems())
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.submitCompany({
          companyName: "ExampleCo",
          websiteUrl: "https://example.com",
          companyId: "existing-company-123",
          allowReanalysis: true,
        })
      })

      expect(queueClient.submitCompany).toHaveBeenCalledWith({
        companyName: "ExampleCo",
        websiteUrl: "https://example.com",
        companyId: "existing-company-123",
        source: "user_request",
        allowReanalysis: true,
      })
    })

    it("adds submitted company to queue items", async () => {
      const { result } = renderHook(() => useQueueItems())
      await waitFor(() => expect(result.current.loading).toBe(false))

      const initialLength = result.current.queueItems.length

      await act(async () => {
        await result.current.submitCompany({
          companyName: "ExampleCo",
          websiteUrl: "https://example.com",
        })
      })

      expect(result.current.queueItems.length).toBe(initialLength + 1)
      expect(result.current.queueItems[0].id).toBe("queue-company-1")
    })

    it("returns the queue item id", async () => {
      const { result } = renderHook(() => useQueueItems())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returnedId: string | undefined

      await act(async () => {
        returnedId = await result.current.submitCompany({
          companyName: "ExampleCo",
          websiteUrl: "https://example.com",
        })
      })

      expect(returnedId).toBe("queue-company-1")
    })
  })

  describe("submitSourceRecover", () => {
    const mockRecoverQueueItem = {
      id: "queue-recover-1",
      type: "source_recover",
      status: "pending",
      url: "",
      company_name: "",
      company_id: null,
      source_id: "source-123",
      source: "user_request",
      created_at: "2025-01-01T00:00:00.000Z",
      updated_at: "2025-01-01T00:00:00.000Z",
    }

    beforeEach(() => {
      vi.mocked(queueClient.submitSourceRecover).mockResolvedValue(mockRecoverQueueItem as any)
    })

    it("submits source recovery with sourceId", async () => {
      const { result } = renderHook(() => useQueueItems())
      await waitFor(() => expect(result.current.loading).toBe(false))

      await act(async () => {
        await result.current.submitSourceRecover("source-123")
      })

      expect(queueClient.submitSourceRecover).toHaveBeenCalledWith({
        sourceId: "source-123",
      })
    })

    it("adds submitted recovery to queue items", async () => {
      const { result } = renderHook(() => useQueueItems())
      await waitFor(() => expect(result.current.loading).toBe(false))

      const initialLength = result.current.queueItems.length

      await act(async () => {
        await result.current.submitSourceRecover("source-123")
      })

      expect(result.current.queueItems.length).toBe(initialLength + 1)
      expect(result.current.queueItems[0].id).toBe("queue-recover-1")
    })

    it("returns the queue item id", async () => {
      const { result } = renderHook(() => useQueueItems())
      await waitFor(() => expect(result.current.loading).toBe(false))

      let returnedId: string | undefined

      await act(async () => {
        returnedId = await result.current.submitSourceRecover("source-123")
      })

      expect(returnedId).toBe("queue-recover-1")
    })
  })
})
