import { renderHook, waitFor, act } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { useCompany, clearCompanyCache, invalidateCompanyCache } from "../useCompany"
import { companiesClient } from "@/api"

vi.mock("@/api", () => ({
  companiesClient: {
    getCompany: vi.fn(),
  },
}))

const mockCompany = {
  id: "company-123",
  name: "Acme Corp",
  website: "https://acme.com",
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe("useCompany", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCompanyCache()
  })

  it("fetches company data when companyId is provided", async () => {
    vi.mocked(companiesClient.getCompany).mockResolvedValue(mockCompany)

    const { result } = renderHook(() => useCompany("company-123"))

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(companiesClient.getCompany).toHaveBeenCalledWith("company-123")
    expect(result.current.company).toEqual(mockCompany)
    expect(result.current.error).toBeNull()
  })

  it("returns null when companyId is null", async () => {
    const { result } = renderHook(() => useCompany(null))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(companiesClient.getCompany).not.toHaveBeenCalled()
    expect(result.current.company).toBeNull()
  })

  it("returns null when companyId is undefined", async () => {
    const { result } = renderHook(() => useCompany(undefined))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(companiesClient.getCompany).not.toHaveBeenCalled()
    expect(result.current.company).toBeNull()
  })

  it("handles fetch errors gracefully", async () => {
    const mockError = new Error("Failed to fetch company")
    vi.mocked(companiesClient.getCompany).mockRejectedValue(mockError)

    const { result } = renderHook(() => useCompany("company-123"))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.company).toBeNull()
    expect(result.current.error).toEqual(mockError)
  })

  it("uses cached data within TTL", async () => {
    vi.mocked(companiesClient.getCompany).mockResolvedValue(mockCompany)

    const { result: result1 } = renderHook(() => useCompany("company-123"))
    await waitFor(() => expect(result1.current.loading).toBe(false))

    expect(companiesClient.getCompany).toHaveBeenCalledTimes(1)

    // Second hook should use cache
    const { result: result2 } = renderHook(() => useCompany("company-123"))
    await waitFor(() => expect(result2.current.loading).toBe(false))

    expect(companiesClient.getCompany).toHaveBeenCalledTimes(1) // Still 1
    expect(result2.current.company).toEqual(mockCompany)
  })

  it("does not auto-fetch when autoFetch is false", async () => {
    vi.mocked(companiesClient.getCompany).mockResolvedValue(mockCompany)

    const { result } = renderHook(() => useCompany("company-123", { autoFetch: false }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(companiesClient.getCompany).not.toHaveBeenCalled()
    expect(result.current.company).toBeNull()
  })

  it("refetch fetches fresh data", async () => {
    const updatedCompany = { ...mockCompany, name: "Updated Acme" }
    vi.mocked(companiesClient.getCompany)
      .mockResolvedValueOnce(mockCompany)
      .mockResolvedValueOnce(updatedCompany)

    const { result } = renderHook(() => useCompany("company-123"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.company?.name).toBe("Acme Corp")

    // Clear cache and refetch
    clearCompanyCache()
    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.company?.name).toBe("Updated Acme")
  })

  it("invalidateCompanyCache removes specific company from cache", async () => {
    vi.mocked(companiesClient.getCompany).mockResolvedValue(mockCompany)

    const { result } = renderHook(() => useCompany("company-123"))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(companiesClient.getCompany).toHaveBeenCalledTimes(1)

    // Invalidate and refetch
    invalidateCompanyCache("company-123")
    await act(async () => {
      await result.current.refetch()
    })

    expect(companiesClient.getCompany).toHaveBeenCalledTimes(2)
  })
})
