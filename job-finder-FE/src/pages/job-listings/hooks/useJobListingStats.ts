import { useState, useEffect } from "react"
import { jobListingsClient } from "@/api"
import { logger } from "@/services/logging/FrontendLogger"
import type { JobListingStats } from "@shared/types"

interface UseJobListingStatsOptions {
  /** Whether stats fetching is enabled (typically based on user auth) */
  enabled: boolean
}

interface UseJobListingStatsResult {
  stats: JobListingStats | null
  loading: boolean
}

/**
 * Hook for fetching job listing statistics from the server.
 * Provides accurate totals not limited by pagination.
 */
export function useJobListingStats({ enabled }: UseJobListingStatsOptions): UseJobListingStatsResult {
  const [stats, setStats] = useState<JobListingStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return
    }

    let cancelled = false

    const fetchStats = async () => {
      try {
        setLoading(true)
        const serverStats = await jobListingsClient.getStats()
        if (!cancelled) {
          setStats(serverStats)
        }
      } catch (err) {
        logger.error("JobListingStats", "fetch", "Failed to fetch job listing stats", {
          error: { type: "FetchError", message: err instanceof Error ? err.message : String(err) },
        })
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchStats()

    return () => {
      cancelled = true
    }
  }, [enabled])

  return { stats, loading }
}
