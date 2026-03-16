import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ResumeVersionsClient } from "../resume-versions-client"

vi.mock("@/config/api", () => ({
  API_CONFIG: { baseUrl: "https://api.test.com" },
}))

vi.mock("@/lib/api-error-handler", () => ({
  handleApiError: vi.fn((e: unknown) => e),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

describe("ResumeVersionsClient", () => {
  let client: ResumeVersionsClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new ResumeVersionsClient("https://api.test.com")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockSuccess = (data: unknown) => ({
    ok: true,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve({ data }),
  })

  describe("listVersions", () => {
    it("fetches all resume versions", async () => {
      const versions = [{ slug: "frontend", name: "Frontend" }]
      mockFetch.mockResolvedValue(mockSuccess({ versions }))

      const result = await client.listVersions()

      expect(result).toEqual(versions)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/resume-versions",
        expect.objectContaining({ method: "GET" })
      )
    })
  })

  describe("getVersion", () => {
    it("fetches a version by slug", async () => {
      const versionData = { version: { slug: "frontend" }, items: [] }
      mockFetch.mockResolvedValue(mockSuccess(versionData))

      const result = await client.getVersion("frontend")

      expect(result).toEqual(versionData)
    })
  })

  describe("getItems", () => {
    it("fetches items for a version", async () => {
      const items = [{ id: "1", title: "Experience" }]
      mockFetch.mockResolvedValue(mockSuccess({ items }))

      const result = await client.getItems("frontend")

      expect(result).toEqual(items)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/resume-versions/frontend/items",
        expect.objectContaining({ method: "GET" })
      )
    })
  })

  describe("createItem", () => {
    it("posts a new resume item", async () => {
      const item = { id: "new", title: "Skills" }
      mockFetch.mockResolvedValue(mockSuccess({ item }))

      const result = await client.createItem("frontend", { title: "Skills" })

      expect(result).toEqual(item)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.itemData.title).toBe("Skills")
    })
  })

  describe("updateItem", () => {
    it("patches a resume item", async () => {
      const item = { id: "1", title: "Updated" }
      mockFetch.mockResolvedValue(mockSuccess({ item }))

      const result = await client.updateItem("frontend", "1", { title: "Updated" })

      expect(result).toEqual(item)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/resume-versions/frontend/items/1",
        expect.objectContaining({ method: "PATCH" })
      )
    })
  })

  describe("deleteItem", () => {
    it("deletes a resume item", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ deleted: true }))

      await client.deleteItem("frontend", "1")

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/resume-versions/frontend/items/1",
        expect.objectContaining({ method: "DELETE" })
      )
    })
  })

  describe("reorderItem", () => {
    it("posts reorder request", async () => {
      const item = { id: "1", orderIndex: 3 }
      mockFetch.mockResolvedValue(mockSuccess({ item }))

      const result = await client.reorderItem("frontend", "1", null, 3)

      expect(result).toEqual(item)
      const body = JSON.parse(mockFetch.mock.calls[0][1].body)
      expect(body.parentId).toBeNull()
      expect(body.orderIndex).toBe(3)
    })
  })

  describe("createVersion", () => {
    it("posts a new version", async () => {
      const version = { slug: "ai", name: "AI Engineer" }
      mockFetch.mockResolvedValue(mockSuccess({ version }))

      const result = await client.createVersion({ slug: "ai", name: "AI Engineer" })

      expect(result).toEqual(version)
    })
  })

  describe("deleteVersion", () => {
    it("deletes a version", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ deleted: true }))

      await client.deleteVersion("ai")

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/resume-versions/ai",
        expect.objectContaining({ method: "DELETE" })
      )
    })
  })

  describe("publish", () => {
    it("posts publish request", async () => {
      const publishResult = { pdfUrl: "/api/resume-versions/frontend/pdf" }
      mockFetch.mockResolvedValue(mockSuccess(publishResult))

      const result = await client.publish("frontend")

      expect(result).toEqual(publishResult)
    })
  })

  describe("getPdfUrl", () => {
    it("returns the PDF URL for a slug", () => {
      const url = client.getPdfUrl("frontend")

      expect(url).toBe("https://api.test.com/resume-versions/frontend/pdf")
    })
  })

  describe("tailorResume", () => {
    it("posts tailor request without force", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ status: "ready" }))

      await client.tailorResume("match-1")

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/resume-versions/pool/tailor",
        expect.objectContaining({ method: "POST" })
      )
    })

    it("appends force query param", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ status: "ready" }))

      await client.tailorResume("match-1", true)

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/resume-versions/pool/tailor?force=true",
        expect.objectContaining({ method: "POST" })
      )
    })
  })

  describe("getTailoredPdfUrl", () => {
    it("returns the tailored PDF URL", () => {
      const url = client.getTailoredPdfUrl("match-1")

      expect(url).toBe("https://api.test.com/resume-versions/pool/tailor/match-1/pdf")
    })
  })

  describe("getPoolHealth", () => {
    it("fetches pool health", async () => {
      const health = { ready: 3, pending: 1 }
      mockFetch.mockResolvedValue(mockSuccess(health))

      const result = await client.getPoolHealth()

      expect(result).toEqual(health)
    })
  })
})
