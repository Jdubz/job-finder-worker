import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { JobSourcesClient } from "../job-sources-client"

vi.mock("@/config/api", () => ({
  API_CONFIG: { baseUrl: "https://api.test.com" },
}))

vi.mock("@/lib/api-error-handler", () => ({
  handleApiError: vi.fn((e: unknown) => e),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

describe("JobSourcesClient", () => {
  let client: JobSourcesClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new JobSourcesClient("https://api.test.com")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockSuccess = (data: unknown) => ({
    ok: true,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve({ data }),
  })

  describe("listJobSources", () => {
    it("fetches sources with no filters", async () => {
      const responseData = { sources: [], count: 0 }
      mockFetch.mockResolvedValue(mockSuccess(responseData))

      const result = await client.listJobSources()

      expect(result).toEqual(responseData)
    })

    it("builds query with all filter params", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ sources: [], count: 0 }))

      await client.listJobSources({
        status: "active",
        sourceType: "greenhouse",
        companyId: "comp-1",
        search: "test",
        sortBy: "name",
        sortOrder: "asc",
        limit: 10,
        offset: 5,
      })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain("status=active")
      expect(url).toContain("sourceType=greenhouse")
      expect(url).toContain("companyId=comp-1")
      expect(url).toContain("search=test")
      expect(url).toContain("limit=10")
      expect(url).toContain("offset=5")
    })
  })

  describe("getJobSource", () => {
    it("fetches a single source", async () => {
      const source = { id: "1", url: "https://greenhouse.io/acme" }
      mockFetch.mockResolvedValue(mockSuccess({ source }))

      const result = await client.getJobSource("1")

      expect(result).toEqual(source)
    })
  })

  describe("updateJobSource", () => {
    it("patches a source", async () => {
      const source = { id: "1", status: "paused" }
      mockFetch.mockResolvedValue(mockSuccess({ source }))

      const result = await client.updateJobSource("1", { status: "paused" })

      expect(result).toEqual(source)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/job-sources/1",
        expect.objectContaining({ method: "PATCH" })
      )
    })
  })

  describe("deleteJobSource", () => {
    it("deletes a source", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ deleted: true }))

      await client.deleteJobSource("1")

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/job-sources/1",
        expect.objectContaining({ method: "DELETE" })
      )
    })
  })

  describe("getStats", () => {
    it("fetches source stats", async () => {
      const stats = { total: 20, active: 15, paused: 5 }
      mockFetch.mockResolvedValue(mockSuccess({ stats }))

      const result = await client.getStats()

      expect(result).toEqual(stats)
    })
  })
})
