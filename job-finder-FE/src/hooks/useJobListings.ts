import { useState, useEffect, useCallback } from "react"
import { jobListingsClient, type JobListingFilters } from "@/api/job-listings-client"
import type { JobListingRecord } from "@shared/types"

interface UseJobListingsResult {
  listings: JobListingRecord[]
  loading: boolean
  error: Error | null
  count: number
  refetch: () => Promise<void>
  deleteListing: (id: string) => Promise<void>
  setFilters: (filters: JobListingFilters) => void
}

export function useJobListings(initialFilters: JobListingFilters = {}): UseJobListingsResult {
  const [listings, setListings] = useState<JobListingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [count, setCount] = useState(0)
  const [filters, setFilters] = useState<JobListingFilters>({
    sortBy: "updated",
    sortOrder: "desc",
    ...initialFilters,
  })

  const fetchListings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await jobListingsClient.listListings(filters)
      setListings(result.listings)
      setCount(result.count)
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch job listings"))
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    fetchListings()
  }, [fetchListings])

  const deleteListing = useCallback(async (id: string) => {
    await jobListingsClient.deleteListing(id)
    setListings((prev) => prev.filter((l) => l.id !== id))
    setCount((prev) => prev - 1)
  }, [])

  return {
    listings,
    loading,
    error,
    count,
    refetch: fetchListings,
    deleteListing,
    setFilters,
  }
}
