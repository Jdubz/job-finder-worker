import { useState, useEffect } from "react"
import type { QueueItem, QueueStats } from "@shared/types"
import { queueClient } from "@/api/queue-client"
import { logger } from "@/services/logging/FrontendLogger"

/** Debounce delay for stats fetching to avoid rapid API calls from SSE events */
const STATS_FETCH_DEBOUNCE_MS = 500

interface UseQueueStatsOptions {
  /** Whether the user is authorized to fetch stats */
  enabled: boolean
  /** Queue items for fallback calculation when API fails */
  queueItems: QueueItem[]
}

interface UseQueueStatsResult {
  stats: QueueStats | null
  loading: boolean
  usingFallback: boolean
}

/**
 * Hook for fetching and managing queue statistics.
 * Falls back to local calculation from queueItems if API fails.
 */
export function useQueueStats({ enabled, queueItems }: UseQueueStatsOptions): UseQueueStatsResult {
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [usingFallback, setUsingFallback] = useState(false)

  useEffect(() => {
    if (!enabled) return

    const fetchStats = async () => {
      try {
        setLoading(true)
        const fetchedStats = await queueClient.getStats()
        setStats(fetchedStats)
        setUsingFallback(false)
      } catch (err) {
        logger.error("QueueStats", "fetchStats", "Failed to fetch queue stats", {
          error: { type: "FetchError", message: err instanceof Error ? err.message : String(err) },
        })
        // Fallback to local calculation if API fails (limited to loaded items)
        const fallbackStats: QueueStats = {
          total: queueItems.length,
          pending: queueItems.filter((i) => i.status === "pending").length,
          processing: queueItems.filter((i) => i.status === "processing").length,
          success: queueItems.filter((i) => i.status === "success").length,
          failed: queueItems.filter((i) => i.status === "failed").length,
          skipped: queueItems.filter((i) => i.status === "skipped").length,
        }
        setStats(fallbackStats)
        setUsingFallback(true)
      } finally {
        setLoading(false)
      }
    }

    // Debounce stats fetch to avoid rapid API calls from SSE events
    const timeoutId = setTimeout(fetchStats, STATS_FETCH_DEBOUNCE_MS)
    return () => clearTimeout(timeoutId)
  }, [enabled, queueItems])

  return { stats, loading, usingFallback }
}
