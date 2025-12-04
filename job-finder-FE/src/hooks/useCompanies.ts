import { useCallback, useEffect, useState } from "react"
import { companiesClient } from "@/api"
import type { Company, PaginationMeta } from "@shared/types"
import type { ListCompaniesParams } from "@/api/companies-client"

interface UseCompaniesOptions extends ListCompaniesParams {
  autoFetch?: boolean
}

interface UseCompaniesResult {
  companies: Company[]
  loading: boolean
  error: Error | null
  pagination: PaginationMeta | null
  updateCompany: (id: string, updates: Partial<Company>) => Promise<Company>
  deleteCompany: (id: string) => Promise<void>
  refetch: () => Promise<void>
  setFilters: (filters: ListCompaniesParams) => void
}

export function useCompanies(options: UseCompaniesOptions = { sortBy: "updated_at", sortOrder: "desc" }): UseCompaniesResult {
  const { autoFetch = true, ...initialFilters } = {
    sortBy: "updated_at",
    sortOrder: "desc",
    ...options,
  }

  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState<boolean>(autoFetch)
  const [error, setError] = useState<Error | null>(null)
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [filters, setFiltersState] = useState<ListCompaniesParams>(initialFilters)

  const fetchCompanies = useCallback(async () => {
    setLoading(true)
    try {
      const response = await companiesClient.listCompanies(filters)
      setCompanies(response.items)
      setPagination(response.pagination)
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    if (autoFetch) {
      fetchCompanies()
    }
  }, [autoFetch, fetchCompanies])

  const updateCompany = useCallback(
    async (id: string, updates: Partial<Company>) => {
      const updated = await companiesClient.updateCompany(id, updates)
      setCompanies((prev) => prev.map((c) => (c.id === id ? updated : c)))
      return updated
    },
    []
  )

  const deleteCompany = useCallback(
    async (id: string) => {
      await companiesClient.deleteCompany(id)
      setCompanies((prev) => prev.filter((c) => c.id !== id))
    },
    []
  )

  const refetch = useCallback(async () => {
    await fetchCompanies()
  }, [fetchCompanies])

  const setFilters = useCallback((newFilters: ListCompaniesParams) => {
    setFiltersState(newFilters)
  }, [])

  return {
    companies,
    loading,
    error,
    pagination,
    updateCompany,
    deleteCompany,
    refetch,
    setFilters
  }
}
