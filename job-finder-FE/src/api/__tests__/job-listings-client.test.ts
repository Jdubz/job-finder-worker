import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { JobListingsClient } from "../job-listings-client"

vi.mock("@/config/api", () => ({
  API_CONFIG: { baseUrl: "https://api.test.com" },
}))

vi.mock("@/lib/api-error-handler", () => ({
  handleApiError: vi.fn((e: unknown) => e),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

describe("JobListingsClient", () => {
  let client: JobListingsClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new JobListingsClient("https://api.test.com")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockSuccess = (data: unknown) => ({
    ok: true,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve({ data }),
  })

  describe("listListings", () => {
    it("fetches listings with no filters", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ listings: [], count: 0 }))

      const result = await client.listListings()

      expect(result).toEqual({ listings: [], count: 0 })
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/job-listings",
        expect.objectContaining({ method: "GET" })
      )
    })

    it("builds query string from filters", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ listings: [], count: 0 }))

      await client.listListings({
        status: "pending",
        sourceId: "src-1",
        companyId: "comp-1",
        search: "engineer",
        sortBy: "date",
        sortOrder: "desc",
        limit: 25,
        offset: 50,
      })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain("status=pending")
      expect(url).toContain("sourceId=src-1")
      expect(url).toContain("companyId=comp-1")
      expect(url).toContain("search=engineer")
      expect(url).toContain("sortBy=date")
      expect(url).toContain("sortOrder=desc")
      expect(url).toContain("limit=25")
      expect(url).toContain("offset=50")
    })

    it("handles wrapped response shape", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ listings: [{ id: "1" }], count: 1 }))

      const result = await client.listListings()

      expect(result.listings).toHaveLength(1)
      expect(result.count).toBe(1)
    })
  })

  describe("getListing", () => {
    it("fetches a single listing", async () => {
      const listing = { id: "1", title: "Engineer", company_name: "Acme" }
      mockFetch.mockResolvedValue(mockSuccess({ listing }))

      const result = await client.getListing("1")

      expect(result).toEqual(listing)
    })

    it("throws when listing not in response", async () => {
      mockFetch.mockResolvedValue(mockSuccess({}))

      await expect(client.getListing("1")).rejects.toThrow("Listing not found")
    })
  })

  describe("deleteListing", () => {
    it("deletes a listing and returns success", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ deleted: true }))

      const result = await client.deleteListing("1")

      expect(result).toBe(true)
    })
  })

  describe("getStats", () => {
    it("fetches listing stats", async () => {
      const stats = { active: 10, archived: 5 }
      mockFetch.mockResolvedValue(mockSuccess({ stats }))

      const result = await client.getStats()

      expect(result).toEqual(stats)
    })
  })
})
