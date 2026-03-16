import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ConfigClient } from "../config-client"
import type { PreFilterPolicy, WorkerSettings } from "@shared/types"

vi.mock("@/config/api", () => ({
  API_CONFIG: { baseUrl: "https://api.test.com" },
}))

vi.mock("@/lib/api-error-handler", () => ({
  handleApiError: vi.fn((e: unknown) => e),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

describe("ConfigClient", () => {
  let client: ConfigClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new ConfigClient("https://api.test.com")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockSuccess = (data: unknown) => ({
    ok: true,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve({ data }),
  })

  describe("getPrefilterPolicy", () => {
    it("fetches prefilter-policy config entry", async () => {
      const policy = { maxDaysOld: 30, allowRemote: true }
      mockFetch.mockResolvedValue(mockSuccess({ config: { payload: policy } }))

      const result = await client.getPrefilterPolicy()

      expect(result).toEqual(policy)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/config/prefilter-policy",
        expect.objectContaining({ method: "GET" })
      )
    })
  })

  describe("updatePrefilterPolicy", () => {
    it("updates prefilter-policy", async () => {
      const policy = { maxDaysOld: 14 }
      mockFetch.mockResolvedValue(mockSuccess({ config: { payload: policy } }))

      await client.updatePrefilterPolicy(policy as unknown as PreFilterPolicy)

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/config/prefilter-policy",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify({ payload: policy }),
        })
      )
    })
  })

  describe("getPersonalInfo", () => {
    it("fetches personal-info config", async () => {
      const info = { name: "Test User", email: "test@example.com" }
      mockFetch.mockResolvedValue(mockSuccess({ config: { payload: info } }))

      const result = await client.getPersonalInfo()

      expect(result).toEqual(info)
    })
  })

  describe("updatePersonalInfo", () => {
    it("merges updates with existing data", async () => {
      const existing = { name: "Old Name", email: "old@test.com", phone: "555-0100" }
      // First call: getPersonalInfo
      mockFetch.mockResolvedValueOnce(mockSuccess({ config: { payload: existing } }))
      // Second call: updateConfigEntry
      mockFetch.mockResolvedValueOnce(mockSuccess({ config: { payload: {} } }))

      const result = await client.updatePersonalInfo({ name: "New Name" })

      expect(result.name).toBe("New Name")
      expect(result.phone).toBe("555-0100")
      expect(result.email).toBe("old@test.com")
    })
  })

  describe("updateWorkerSettings", () => {
    it("deep-merges nested objects", async () => {
      const existing = {
        scraping: { maxPages: 10, timeout: 30 },
        textLimits: { maxLength: 5000 },
        runtime: { concurrency: 2, pollInterval: 5 },
        health: { enabled: true },
        cache: { ttl: 3600 },
      }
      // getWorkerSettings call
      mockFetch.mockResolvedValueOnce(mockSuccess({ config: { payload: existing } }))
      // updateConfigEntry call
      mockFetch.mockResolvedValueOnce(mockSuccess({ config: { payload: {} } }))

      await client.updateWorkerSettings({
        scraping: { maxPages: 20 },
        runtime: { concurrency: 4 },
      } as unknown as Partial<WorkerSettings>)

      const putBody = JSON.parse(mockFetch.mock.calls[1][1].body)
      // scraping should be merged, not replaced
      expect(putBody.payload.scraping).toEqual({ maxPages: 20, timeout: 30 })
      expect(putBody.payload.runtime).toEqual({ concurrency: 4, pollInterval: 5 })
      // textLimits unchanged
      expect(putBody.payload.textLimits).toEqual({ maxLength: 5000 })
    })
  })

  describe("getQueueSettings", () => {
    it("returns runtime from worker settings", async () => {
      const ws = { runtime: { concurrency: 2 } }
      mockFetch.mockResolvedValue(mockSuccess({ config: { payload: ws } }))

      const result = await client.getQueueSettings()

      expect(result).toEqual({ concurrency: 2 })
    })
  })

  describe("listEntries", () => {
    it("fetches all config entries", async () => {
      const configs = [{ id: "a" }, { id: "b" }]
      mockFetch.mockResolvedValue(mockSuccess({ configs }))

      const result = await client.listEntries()

      expect(result).toEqual(configs)
    })
  })

  describe("getCronConfig", () => {
    it("fetches cron-config entry", async () => {
      const config = { scrape: { enabled: true } }
      mockFetch.mockResolvedValue(mockSuccess({ config: { payload: config } }))

      const result = await client.getCronConfig()

      expect(result).toEqual(config)
    })
  })
})
