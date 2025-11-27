import { useCallback, useEffect, useState } from "react"
import { jobSourcesClient } from "@/api"
import type { JobSource, JobSourceStats, PaginationMeta } from "@shared/types"
import type { ListJobSourcesParams } from "@/api/job-sources-client"

interface UseJobSourcesOptions extends ListJobSourcesParams {
  autoFetch?: boolean
}

interface UseJobSourcesResult {
  sources: JobSource[]
  loading: boolean
  error: Error | null
  pagination: PaginationMeta | null
  stats: JobSourceStats | null
  updateSource: (id: string, updates: Partial<JobSource>) => Promise<JobSource>
  deleteSource: (id: string) => Promise<void>
  refetch: () => Promise<void>
  fetchStats: () => Promise<void>
  setFilters: (filters: ListJobSourcesParams) => void
}

export function useJobSources(options: UseJobSourcesOptions = {}): UseJobSourcesResult {
  const { autoFetch = true, ...initialFilters } = options

  const [sources, setSources] = useState<JobSource[]>([])
  const [loading, setLoading] = useState<boolean>(autoFetch)
  const [error, setError] = useState<Error | null>(null)
  const [pagination, setPagination] = useState<PaginationMeta | null>(null)
  const [stats, setStats] = useState<JobSourceStats | null>(null)
  const [filters, setFiltersState] = useState<ListJobSourcesParams>(initialFilters)

  const fetchSources = useCallback(async () => {
    setLoading(true)
    try {
      const response = await jobSourcesClient.listJobSources(filters)
      setSources(response.items)
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
      fetchSources()
    }
  }, [autoFetch, fetchSources])

  const fetchStats = useCallback(async () => {
    try {
      const fetchedStats = await jobSourcesClient.getStats()
      setStats(fetchedStats)
    } catch (err) {
      console.error("Failed to fetch job source stats", err)
    }
  }, [])

  const updateSource = useCallback(
    async (id: string, updates: Partial<JobSource>) => {
      const updated = await jobSourcesClient.updateJobSource(id, updates)
      setSources((prev) => prev.map((s) => (s.id === id ? updated : s)))
      return updated
    },
    []
  )

  const deleteSource = useCallback(
    async (id: string) => {
      await jobSourcesClient.deleteJobSource(id)
      setSources((prev) => prev.filter((s) => s.id !== id))
    },
    []
  )

  const refetch = useCallback(async () => {
    await fetchSources()
  }, [fetchSources])

  const setFilters = useCallback((newFilters: ListJobSourcesParams) => {
    setFiltersState(newFilters)
  }, [])

  return {
    sources,
    loading,
    error,
    pagination,
    stats,
    updateSource,
    deleteSource,
    refetch,
    fetchStats,
    setFilters
  }
}
