import { renderHook, waitFor, act } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { useJobSources } from "../useJobSources"
import { jobSourcesClient } from "@/api"

vi.mock("@/api", () => ({
  jobSourcesClient: {
    listJobSources: vi.fn(),
    updateJobSource: vi.fn(),
    deleteJobSource: vi.fn(),
    getStats: vi.fn(),
  },
}))

const mockResponse = {
  items: [
    { id: "s1", url: "https://greenhouse.io/acme", status: "active" },
    { id: "s2", url: "https://ashby.io/beta", status: "paused" },
  ],
  pagination: { limit: 50, offset: 0, total: 2, hasMore: false },
}

describe("useJobSources", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("auto-fetches sources on mount", async () => {
    vi.mocked(jobSourcesClient.listJobSources).mockResolvedValue(mockResponse as any)

    const { result } = renderHook(() => useJobSources())

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.sources).toHaveLength(2)
    expect(result.current.error).toBeNull()
  })

  it("does not auto-fetch when autoFetch is false", async () => {
    const { result } = renderHook(() => useJobSources({ autoFetch: false }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(jobSourcesClient.listJobSources).not.toHaveBeenCalled()
  })

  it("handles fetch errors", async () => {
    vi.mocked(jobSourcesClient.listJobSources).mockRejectedValue(new Error("Fetch failed"))

    const { result } = renderHook(() => useJobSources())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error?.message).toBe("Fetch failed")
  })

  it("updates a source in-place", async () => {
    vi.mocked(jobSourcesClient.listJobSources).mockResolvedValue(mockResponse as any)
    const updated = { id: "s1", url: "https://greenhouse.io/acme", status: "paused" }
    vi.mocked(jobSourcesClient.updateJobSource).mockResolvedValue(updated as any)

    const { result } = renderHook(() => useJobSources())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateSource("s1", { status: "paused" } as any)
    })

    expect(result.current.sources[0].status).toBe("paused")
  })

  it("deletes a source from the list", async () => {
    vi.mocked(jobSourcesClient.listJobSources).mockResolvedValue(mockResponse as any)
    vi.mocked(jobSourcesClient.deleteJobSource).mockResolvedValue(undefined)

    const { result } = renderHook(() => useJobSources())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteSource("s1")
    })

    expect(result.current.sources).toHaveLength(1)
    expect(result.current.sources[0].id).toBe("s2")
  })

  it("fetches stats separately", async () => {
    vi.mocked(jobSourcesClient.listJobSources).mockResolvedValue(mockResponse as any)
    const mockStats = { total: 10, active: 8, paused: 2 }
    vi.mocked(jobSourcesClient.getStats).mockResolvedValue(mockStats as any)

    const { result } = renderHook(() => useJobSources())
    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.stats).toBeNull()

    await act(async () => {
      await result.current.fetchStats()
    })

    expect(result.current.stats).toEqual(mockStats)
  })

  it("re-fetches when filters change", async () => {
    vi.mocked(jobSourcesClient.listJobSources).mockResolvedValue(mockResponse as any)

    const { result } = renderHook(() => useJobSources())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.setFilters({ search: "greenhouse" })
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(jobSourcesClient.listJobSources).toHaveBeenCalledTimes(2)
  })
})
