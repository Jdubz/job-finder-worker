import { renderHook, waitFor, act } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { useJobListings } from "../useJobListings"
import { jobListingsClient } from "@/api/job-listings-client"

vi.mock("@/api/job-listings-client", () => ({
  jobListingsClient: {
    listListings: vi.fn(),
    deleteListing: vi.fn(),
  },
}))

const mockListings = [
  {
    id: "listing-1",
    title: "Senior Frontend Engineer",
    companyName: "Acme Corp",
    companyId: "company-1",
    url: "https://acme.com/jobs/1",
    description: "Great job",
    status: "analyzed" as const,
    location: "Remote",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "listing-2",
    title: "Backend Developer",
    companyName: "Tech Inc",
    companyId: "company-2",
    url: "https://tech.com/jobs/2",
    description: "Another job",
    status: "pending" as const,
    location: "New York",
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]

describe("useJobListings", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(jobListingsClient.listListings).mockResolvedValue({
      listings: mockListings,
      count: mockListings.length,
    })
  })

  it("fetches listings on mount", async () => {
    const { result } = renderHook(() => useJobListings())

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(jobListingsClient.listListings).toHaveBeenCalledWith({
      sortBy: "updated",
      sortOrder: "desc",
    })
    expect(result.current.listings).toEqual(mockListings)
    expect(result.current.count).toBe(2)
    expect(result.current.error).toBeNull()
  })

  it("uses initial filters", async () => {
    const { result } = renderHook(() =>
      useJobListings({
        status: "analyzed",
        limit: 50,
        sortBy: "date",
        sortOrder: "asc",
      })
    )

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(jobListingsClient.listListings).toHaveBeenCalledWith({
      status: "analyzed",
      limit: 50,
      sortBy: "date",
      sortOrder: "asc",
    })
  })

  it("handles fetch errors", async () => {
    const mockError = new Error("Failed to fetch listings")
    vi.mocked(jobListingsClient.listListings).mockRejectedValue(mockError)

    const { result } = renderHook(() => useJobListings())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.listings).toEqual([])
    expect(result.current.error?.message).toBe("Failed to fetch listings")
  })

  it("setFilters triggers a new fetch", async () => {
    const { result } = renderHook(() => useJobListings())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(jobListingsClient.listListings).toHaveBeenCalledTimes(1)

    act(() => {
      result.current.setFilters({
        status: "pending",
        sortBy: "title",
        sortOrder: "asc",
      })
    })

    await waitFor(() => {
      expect(jobListingsClient.listListings).toHaveBeenCalledTimes(2)
    })

    expect(jobListingsClient.listListings).toHaveBeenLastCalledWith({
      status: "pending",
      sortBy: "title",
      sortOrder: "asc",
    })
  })

  it("deleteListing removes listing from state", async () => {
    vi.mocked(jobListingsClient.deleteListing).mockResolvedValue(true)

    const { result } = renderHook(() => useJobListings())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.listings).toHaveLength(2)
    expect(result.current.count).toBe(2)

    await act(async () => {
      await result.current.deleteListing("listing-1")
    })

    expect(jobListingsClient.deleteListing).toHaveBeenCalledWith("listing-1")
    expect(result.current.listings).toHaveLength(1)
    expect(result.current.listings[0].id).toBe("listing-2")
    expect(result.current.count).toBe(1)
  })

  it("refetch re-fetches listings", async () => {
    const { result } = renderHook(() => useJobListings())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(jobListingsClient.listListings).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.refetch()
    })

    expect(jobListingsClient.listListings).toHaveBeenCalledTimes(2)
  })

  it("wraps non-Error exceptions in Error", async () => {
    vi.mocked(jobListingsClient.listListings).mockRejectedValue("string error")

    const { result } = renderHook(() => useJobListings())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error?.message).toBe("Failed to fetch job listings")
  })
})
