import { renderHook, waitFor, act } from "@testing-library/react"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { useCompanies } from "../useCompanies"
import { companiesClient } from "@/api"

vi.mock("@/api", () => ({
  companiesClient: {
    listCompanies: vi.fn(),
    updateCompany: vi.fn(),
    deleteCompany: vi.fn(),
  },
}))

const mockResponse = {
  items: [
    { id: "1", name: "Acme Corp" },
    { id: "2", name: "Beta Inc" },
  ],
  pagination: { limit: 50, offset: 0, total: 2, hasMore: false },
}

describe("useCompanies", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("auto-fetches companies on mount", async () => {
    vi.mocked(companiesClient.listCompanies).mockResolvedValue(mockResponse as any)

    const { result } = renderHook(() => useCompanies())

    expect(result.current.loading).toBe(true)

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(companiesClient.listCompanies).toHaveBeenCalled()
    expect(result.current.companies).toHaveLength(2)
    expect(result.current.pagination).toEqual(mockResponse.pagination)
    expect(result.current.error).toBeNull()
  })

  it("does not auto-fetch when autoFetch is false", async () => {
    const { result } = renderHook(() => useCompanies({ autoFetch: false }))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(companiesClient.listCompanies).not.toHaveBeenCalled()
    expect(result.current.companies).toEqual([])
  })

  it("handles fetch errors", async () => {
    vi.mocked(companiesClient.listCompanies).mockRejectedValue(new Error("Network error"))

    const { result } = renderHook(() => useCompanies())

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error?.message).toBe("Network error")
  })

  it("updates a company in-place", async () => {
    vi.mocked(companiesClient.listCompanies).mockResolvedValue(mockResponse as any)
    const updated = { id: "1", name: "Acme Updated" }
    vi.mocked(companiesClient.updateCompany).mockResolvedValue(updated as any)

    const { result } = renderHook(() => useCompanies())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.updateCompany("1", { name: "Acme Updated" } as any)
    })

    expect(companiesClient.updateCompany).toHaveBeenCalledWith("1", { name: "Acme Updated" })
    expect(result.current.companies[0].name).toBe("Acme Updated")
  })

  it("deletes a company from the list", async () => {
    vi.mocked(companiesClient.listCompanies).mockResolvedValue(mockResponse as any)
    vi.mocked(companiesClient.deleteCompany).mockResolvedValue(undefined)

    const { result } = renderHook(() => useCompanies())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.deleteCompany("1")
    })

    expect(result.current.companies).toHaveLength(1)
    expect(result.current.companies[0].id).toBe("2")
  })

  it("refetches when called", async () => {
    vi.mocked(companiesClient.listCompanies)
      .mockResolvedValueOnce(mockResponse as any)
      .mockResolvedValueOnce({ items: [], pagination: { limit: 50, offset: 0, total: 0, hasMore: false } } as any)

    const { result } = renderHook(() => useCompanies())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.companies).toHaveLength(2)

    await act(async () => {
      await result.current.refetch()
    })

    expect(result.current.companies).toHaveLength(0)
    expect(companiesClient.listCompanies).toHaveBeenCalledTimes(2)
  })

  it("re-fetches when filters change", async () => {
    vi.mocked(companiesClient.listCompanies).mockResolvedValue(mockResponse as any)

    const { result } = renderHook(() => useCompanies())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      result.current.setFilters({ search: "acme" })
    })

    await waitFor(() => expect(result.current.loading).toBe(false))

    // Should have been called at least twice (initial + filter change)
    expect(companiesClient.listCompanies).toHaveBeenCalledTimes(2)
  })
})
