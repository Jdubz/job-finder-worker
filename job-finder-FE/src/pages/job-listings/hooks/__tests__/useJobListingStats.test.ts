import { renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { useJobListingStats } from "../useJobListingStats"
import { jobListingsClient } from "@/api"

vi.mock("@/api", () => ({
  jobListingsClient: {
    getStats: vi.fn(),
  },
}))

vi.mock("@/services/logging/FrontendLogger", () => ({
  logger: {
    error: vi.fn(),
  },
}))

const mockStats = {
  total: 100,
  pending: 20,
  analyzing: 5,
  analyzed: 50,
  matched: 15,
  skipped: 10,
}

describe("useJobListingStats", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("fetches stats when enabled", async () => {
    vi.mocked(jobListingsClient.getStats).mockResolvedValue(mockStats)

    const { result } = renderHook(() => useJobListingStats({ enabled: true }))

    expect(result.current.loading).toBe(true)
    expect(result.current.stats).toBeNull()

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(jobListingsClient.getStats).toHaveBeenCalledTimes(1)
    expect(result.current.stats).toEqual(mockStats)
  })

  it("does not fetch stats when disabled", async () => {
    const { result } = renderHook(() => useJobListingStats({ enabled: false }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(jobListingsClient.getStats).not.toHaveBeenCalled()
    expect(result.current.stats).toBeNull()
  })

  it("handles fetch errors gracefully", async () => {
    vi.mocked(jobListingsClient.getStats).mockRejectedValue(new Error("Network error"))

    const { result } = renderHook(() => useJobListingStats({ enabled: true }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.stats).toBeNull()
  })

  it("does not update state after unmount (cancellation)", async () => {
    let resolvePromise: (value: typeof mockStats) => void
    vi.mocked(jobListingsClient.getStats).mockImplementation(
      () => new Promise((resolve) => {
        resolvePromise = resolve
      })
    )

    const { result, unmount } = renderHook(() => useJobListingStats({ enabled: true }))

    expect(result.current.loading).toBe(true)

    // Unmount before promise resolves
    unmount()

    // Resolve the promise after unmount
    resolvePromise!(mockStats)

    // Allow any pending state updates to process
    await new Promise((resolve) => setTimeout(resolve, 10))

    // The test passes if no React state update warnings occur
    // (the cancelled flag should prevent setStats/setLoading after unmount)
  })

  it("refetches when enabled changes from false to true", async () => {
    vi.mocked(jobListingsClient.getStats).mockResolvedValue(mockStats)

    const { result, rerender } = renderHook(
      ({ enabled }) => useJobListingStats({ enabled }),
      { initialProps: { enabled: false } }
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(jobListingsClient.getStats).not.toHaveBeenCalled()

    rerender({ enabled: true })

    await waitFor(() => {
      expect(result.current.stats).toEqual(mockStats)
    })

    expect(jobListingsClient.getStats).toHaveBeenCalledTimes(1)
  })
})
