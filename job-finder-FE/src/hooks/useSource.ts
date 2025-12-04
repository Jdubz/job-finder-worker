import { useCallback, useEffect, useState, useRef } from "react"
import { jobSourcesClient } from "@/api"
import type { JobSource } from "@shared/types"

// Simple in-memory cache for source data
const sourceCache = new Map<string, { source: JobSource; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface UseSourceOptions {
  /** If true, fetches source data on mount. Default: true */
  autoFetch?: boolean
}

interface UseSourceResult {
  source: JobSource | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<JobSource | null>
}

/**
 * Hook to fetch a single job source by ID with caching
 */
export function useSource(sourceId: string | null | undefined, options: UseSourceOptions = {}): UseSourceResult {
  const { autoFetch = true } = options

  const [source, setSource] = useState<JobSource | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<Error | null>(null)
  const fetchingRef = useRef(false)

  const fetchSource = useCallback(async (): Promise<JobSource | null> => {
    if (!sourceId) {
      setSource(null)
      setLoading(false)
      return null
    }

    // Check cache first
    const cached = sourceCache.get(sourceId)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setSource(cached.source)
      setLoading(false)
      setError(null)
      return cached.source
    }

    // Prevent duplicate fetches
    if (fetchingRef.current) {
      return source
    }

    fetchingRef.current = true
    setLoading(true)

    try {
      const fetchedSource = await jobSourcesClient.getJobSource(sourceId)

      // Update cache
      sourceCache.set(sourceId, {
        source: fetchedSource,
        timestamp: Date.now()
      })

      setSource(fetchedSource)
      setError(null)
      return fetchedSource
    } catch (err) {
      setError(err as Error)
      setSource(null)
      return null
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }, [sourceId, source])

  useEffect(() => {
    if (autoFetch && sourceId) {
      fetchSource()
    } else if (!sourceId) {
      setSource(null)
      setLoading(false)
      setError(null)
    }
  }, [autoFetch, sourceId, fetchSource])

  return {
    source,
    loading,
    error,
    refetch: fetchSource
  }
}

/**
 * Utility to invalidate a source from the cache
 */
export function invalidateSourceCache(sourceId: string): void {
  sourceCache.delete(sourceId)
}

/**
 * Utility to clear all cached sources
 */
export function clearSourceCache(): void {
  sourceCache.clear()
}
