import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { QueueClient } from "../queue-client"

vi.mock("@/config/api", () => ({
  API_CONFIG: { baseUrl: "https://api.test.com" },
}))

vi.mock("@/config/constants", () => ({
  QUEUE_MAX_PAGE_LIMIT: 100,
}))

vi.mock("@/lib/api-error-handler", () => ({
  handleApiError: vi.fn((e: unknown) => e),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

describe("QueueClient", () => {
  let client: QueueClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new QueueClient("https://api.test.com")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockSuccess = (data: unknown) => ({
    ok: true,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve({ data }),
  })

  describe("listQueueItems", () => {
    it("fetches queue items with no params", async () => {
      const responseData = { items: [], total: 0 }
      mockFetch.mockResolvedValue(mockSuccess(responseData))

      const result = await client.listQueueItems()

      expect(result).toEqual(responseData)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/queue",
        expect.objectContaining({ method: "GET" })
      )
    })

    it("appends multiple statuses", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ items: [], total: 0 }))

      await client.listQueueItems({ status: ["pending", "processing"] })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain("status=pending")
      expect(url).toContain("status=processing")
    })

    it("clamps limit to QUEUE_MAX_PAGE_LIMIT", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ items: [], total: 0 }))

      await client.listQueueItems({ limit: 999 })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain("limit=100")
    })

    it("appends type and source filters", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ items: [], total: 0 }))

      await client.listQueueItems({ type: "job", source: "user_submission" })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain("type=job")
      expect(url).toContain("source=user_submission")
    })
  })

  describe("getQueueItem", () => {
    it("fetches a single queue item", async () => {
      const queueItem = { id: "q-1", type: "job", status: "pending" }
      mockFetch.mockResolvedValue(mockSuccess({ queueItem }))

      const result = await client.getQueueItem("q-1")

      expect(result).toEqual(queueItem)
    })
  })

  describe("submitJob", () => {
    it("posts a job and returns the queue item", async () => {
      const queueItem = { id: "q-1", type: "job" }
      mockFetch.mockResolvedValue(mockSuccess({ queueItem }))

      const result = await client.submitJob({ url: "https://example.com/job" })

      expect(result).toEqual(queueItem)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/queue/jobs",
        expect.objectContaining({ method: "POST" })
      )
    })

    it("throws when queueItem not in response", async () => {
      mockFetch.mockResolvedValue(mockSuccess({}))

      await expect(client.submitJob({ url: "https://example.com" })).rejects.toThrow(
        "Queue item not returned"
      )
    })
  })

  describe("submitCompany", () => {
    it("posts a company submission", async () => {
      const queueItem = { id: "q-2", type: "company" }
      mockFetch.mockResolvedValue(mockSuccess({ queueItem }))

      const result = await client.submitCompany({ companyName: "Acme" })

      expect(result).toEqual(queueItem)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/queue/companies",
        expect.objectContaining({ method: "POST" })
      )
    })
  })

  describe("submitScrape", () => {
    it("posts a scrape request", async () => {
      const queueItem = { id: "q-3", type: "scrape" }
      mockFetch.mockResolvedValue(mockSuccess({ queueItem }))

      const result = await client.submitScrape({})

      expect(result).toEqual(queueItem)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/queue/scrape",
        expect.objectContaining({ method: "POST" })
      )
    })
  })

  describe("submitSourceDiscovery", () => {
    it("posts source discovery request", async () => {
      const queueItem = { id: "q-4", type: "source_discovery" }
      mockFetch.mockResolvedValue(mockSuccess({ queueItem }))

      const result = await client.submitSourceDiscovery({ url: "https://example.com" })

      expect(result).toEqual(queueItem)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/queue/sources/discover",
        expect.objectContaining({ method: "POST" })
      )
    })
  })

  describe("submitSourceRecover", () => {
    it("posts source recover request", async () => {
      const queueItem = { id: "q-5", type: "source_recover" }
      mockFetch.mockResolvedValue(mockSuccess({ queueItem }))

      const result = await client.submitSourceRecover({ sourceId: "src-1" })

      expect(result).toEqual(queueItem)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/queue/sources/recover",
        expect.objectContaining({ method: "POST" })
      )
    })
  })

  describe("updateQueueItem", () => {
    it("patches a queue item", async () => {
      const queueItem = { id: "q-1", status: "processing" }
      mockFetch.mockResolvedValue(mockSuccess({ queueItem }))

      const result = await client.updateQueueItem("q-1", { status: "processing" })

      expect(result).toEqual(queueItem)
    })
  })

  describe("deleteQueueItem", () => {
    it("deletes a queue item", async () => {
      mockFetch.mockResolvedValue(mockSuccess({}))

      await client.deleteQueueItem("q-1")

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/queue/q-1",
        expect.objectContaining({ method: "DELETE" })
      )
    })
  })

  describe("retryQueueItem", () => {
    it("posts retry for a queue item", async () => {
      const queueItem = { id: "q-1", status: "pending" }
      mockFetch.mockResolvedValue(mockSuccess({ queueItem }))

      const result = await client.retryQueueItem("q-1")

      expect(result).toEqual(queueItem)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/queue/q-1/retry",
        expect.objectContaining({ method: "POST" })
      )
    })
  })

  describe("unblockQueueItem", () => {
    it("posts unblock for a queue item", async () => {
      const queueItem = { id: "q-1", status: "pending" }
      mockFetch.mockResolvedValue(mockSuccess({ queueItem }))

      const result = await client.unblockQueueItem("q-1")

      expect(result).toEqual(queueItem)
    })
  })

  describe("unblockAll", () => {
    it("posts unblock all with optional error category", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ unblocked: 5 }))

      const result = await client.unblockAll("resource")

      expect(result).toEqual({ unblocked: 5 })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.errorCategory).toBe("resource")
    })

    it("posts empty body when no error category", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ unblocked: 3 }))

      await client.unblockAll()

      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body).toEqual({})
    })
  })

  describe("getStats", () => {
    it("fetches queue stats", async () => {
      const stats = { pending: 5, processing: 2, total: 10 }
      mockFetch.mockResolvedValue(mockSuccess({ stats }))

      const result = await client.getStats()

      expect(result).toEqual(stats)
    })
  })

  describe("cron methods", () => {
    it("getCronStatus fetches cron status", async () => {
      const cronStatus = { started: true, jobs: {} }
      mockFetch.mockResolvedValue(mockSuccess(cronStatus))

      const result = await client.getCronStatus()

      expect(result).toEqual(cronStatus)
    })

    it("triggerCronScrape posts trigger", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ success: true }))

      const result = await client.triggerCronScrape()

      expect(result).toEqual({ success: true })
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/queue/cron/trigger/scrape",
        expect.objectContaining({ method: "POST" })
      )
    })

    it("triggerCronMaintenance posts trigger", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ success: true }))

      await client.triggerCronMaintenance()

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/queue/cron/trigger/maintenance",
        expect.objectContaining({ method: "POST" })
      )
    })
  })

  describe("health methods", () => {
    it("getWorkerHealth fetches worker health", async () => {
      const health = { reachable: true, workerUrl: "http://worker:5000" }
      mockFetch.mockResolvedValue(mockSuccess(health))

      const result = await client.getWorkerHealth()

      expect(result).toEqual(health)
    })

    it("getAgentCliHealth fetches CLI health", async () => {
      const health = { status: "ok" }
      mockFetch.mockResolvedValue(mockSuccess(health))

      const result = await client.getAgentCliHealth()

      expect(result).toEqual(health)
    })
  })
})
