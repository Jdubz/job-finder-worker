import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { CompaniesClient } from "../companies-client"

vi.mock("@/config/api", () => ({
  API_CONFIG: { baseUrl: "https://api.test.com" },
}))

vi.mock("@/lib/api-error-handler", () => ({
  handleApiError: vi.fn((e: unknown) => e),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

describe("CompaniesClient", () => {
  let client: CompaniesClient

  beforeEach(() => {
    vi.clearAllMocks()
    client = new CompaniesClient("https://api.test.com")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockSuccess = (data: unknown) => ({
    ok: true,
    headers: { get: () => "application/json" },
    json: () => Promise.resolve({ data }),
  })

  describe("listCompanies", () => {
    it("fetches companies list", async () => {
      const responseData = { companies: [{ id: "1", name: "Acme" }], count: 1 }
      mockFetch.mockResolvedValue(mockSuccess(responseData))

      const result = await client.listCompanies()

      expect(result).toEqual(responseData)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/companies",
        expect.objectContaining({ method: "GET" })
      )
    })

    it("appends query parameters", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ companies: [], count: 0 }))

      await client.listCompanies({
        search: "acme",
        sortBy: "name",
        sortOrder: "asc",
        limit: 10,
        offset: 20,
      })

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toContain("search=acme")
      expect(url).toContain("sortBy=name")
      expect(url).toContain("sortOrder=asc")
      expect(url).toContain("limit=10")
      expect(url).toContain("offset=20")
    })

    it("omits empty params", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ companies: [], count: 0 }))

      await client.listCompanies({})

      const url = mockFetch.mock.calls[0][0] as string
      expect(url).toBe("https://api.test.com/companies")
    })
  })

  describe("getCompany", () => {
    it("fetches a single company", async () => {
      const company = { id: "1", name: "Acme" }
      mockFetch.mockResolvedValue(mockSuccess({ company }))

      const result = await client.getCompany("1")

      expect(result).toEqual(company)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/companies/1",
        expect.objectContaining({ method: "GET" })
      )
    })
  })

  describe("updateCompany", () => {
    it("patches a company", async () => {
      const company = { id: "1", name: "Acme Updated" }
      mockFetch.mockResolvedValue(mockSuccess({ company }))

      const result = await client.updateCompany("1", { name: "Acme Updated" })

      expect(result).toEqual(company)
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/companies/1",
        expect.objectContaining({ method: "PATCH" })
      )
    })
  })

  describe("deleteCompany", () => {
    it("deletes a company", async () => {
      mockFetch.mockResolvedValue(mockSuccess({ deleted: true }))

      await client.deleteCompany("1")

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.test.com/companies/1",
        expect.objectContaining({ method: "DELETE" })
      )
    })
  })
})
