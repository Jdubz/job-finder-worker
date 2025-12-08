import { renderHook, waitFor, act } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { useSource, clearSourceCache, invalidateSourceCache } from "../useSource"
import { jobSourcesClient } from "@/api"

vi.mock("@/api", () => ({
  jobSourcesClient: {
    getJobSource: vi.fn(),
  },
}))

import type { JobSource } from "@shared/types"

const mockSource = {
  id: "source-123",
  name: "LinkedIn Jobs",
  url: "https://linkedin.com/jobs",
  isActive: true,
  sourceType: "rss",
  status: "active",
  configJson: {},
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as JobSource

describe("useSource", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearSourceCache()
  })

  it("fetches source data when sourceId is provided", async () => {
    vi.mocked(jobSourcesClient.getJobSource).mockResolvedValue(mockSource)

    const { result } = renderHook(() => useSource("source-123"))

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(jobSourcesClient.getJobSource).toHaveBeenCalledWith("source-123")
    expect(result.current.source).toEqual(mockSource)
    expect(result.current.error).toBeNull()
  })

  it("returns null when sourceId is null", async () => {
    const { result } = renderHook(() => useSource(null))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(jobSourcesClient.getJobSource).not.toHaveBeenCalled()
    expect(result.current.source).toBeNull()
  })

  it("returns null when sourceId is undefined", async () => {
    const { result } = renderHook(() => useSource(undefined))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(jobSourcesClient.getJobSource).not.toHaveBeenCalled()
    expect(result.current.source).toBeNull()
  })

  it("handles fetch errors gracefully", async () => {
    const mockError = new Error("Failed to fetch source")
    vi.mocked(jobSourcesClient.getJobSource).mockRejectedValue(mockError)

    const { result } = renderHook(() => useSource("source-123"))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.source).toBeNull()
    expect(result.current.error).toEqual(mockError)
  })

  it("uses cached data within TTL", async () => {
    vi.mocked(jobSourcesClient.getJobSource).mockResolvedValue(mockSource)

    const { result: result1 } = renderHook(() => useSource("source-123"))
    await waitFor(() => expect(result1.current.loading).toBe(false))

    expect(jobSourcesClient.getJobSource).toHaveBeenCalledTimes(1)

    // Second hook should use cache
    const { result: result2 } = renderHook(() => useSource("source-123"))
    await waitFor(() => expect(result2.current.loading).toBe(false))

    expect(jobSourcesClient.getJobSource).toHaveBeenCalledTimes(1) // Still 1
    expect(result2.current.source).toEqual(mockSource)
  })

  it("does not auto-fetch when autoFetch is false", async () => {
    vi.mocked(jobSourcesClient.getJobSource).mockResolvedValue(mockSource)

    const { result } = renderHook(() => useSource("source-123", { autoFetch: false }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(jobSourcesClient.getJobSource).not.toHaveBeenCalled()
    expect(result.current.source).toBeNull()
  })

  it("refetch fetches fresh data", async () => {
    const updatedSource = { ...mockSource, name: "Updated LinkedIn" }
    vi.mocked(jobSourcesClient.getJobSource)
      .mockResolvedValueOnce(mockSource)
      .mockResolvedValueOnce(updatedSource)

    const { result } = renderHook(() => useSource("source-123"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.source?.name).toBe("LinkedIn Jobs")

    // Clear cache and refetch
    clearSourceCache()
    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.source?.name).toBe("Updated LinkedIn")
  })

  it("invalidateSourceCache removes specific source from cache", async () => {
    vi.mocked(jobSourcesClient.getJobSource).mockResolvedValue(mockSource)

    const { result } = renderHook(() => useSource("source-123"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(jobSourcesClient.getJobSource).toHaveBeenCalledTimes(1)

    // Invalidate and refetch
    invalidateSourceCache("source-123")
    await act(async () => {
      await result.current.refetch()
    })

    expect(jobSourcesClient.getJobSource).toHaveBeenCalledTimes(2)
  })
})
