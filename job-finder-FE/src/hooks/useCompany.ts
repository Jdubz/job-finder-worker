import { useCallback, useEffect, useState, useRef } from "react"
import { companiesClient } from "@/api"
import type { Company } from "@shared/types"

// Simple in-memory cache for company data
const companyCache = new Map<string, { company: Company; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

interface UseCompanyOptions {
  /** If true, fetches company data on mount. Default: true */
  autoFetch?: boolean
}

interface UseCompanyResult {
  company: Company | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<Company | null>
}

/**
 * Hook to fetch a single company by ID with caching
 */
export function useCompany(companyId: string | null | undefined, options: UseCompanyOptions = {}): UseCompanyResult {
  const { autoFetch = true } = options

  const [company, setCompany] = useState<Company | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<Error | null>(null)
  const fetchingRef = useRef(false)

  const fetchCompany = useCallback(async (): Promise<Company | null> => {
    if (!companyId) {
      setCompany(null)
      setLoading(false)
      return null
    }

    // Check cache first
    const cached = companyCache.get(companyId)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setCompany(cached.company)
      setLoading(false)
      setError(null)
      return cached.company
    }

    // Prevent duplicate fetches
    if (fetchingRef.current) {
      return company
    }

    fetchingRef.current = true
    setLoading(true)

    try {
      const fetchedCompany = await companiesClient.getCompany(companyId)

      // Update cache
      companyCache.set(companyId, {
        company: fetchedCompany,
        timestamp: Date.now()
      })

      setCompany(fetchedCompany)
      setError(null)
      return fetchedCompany
    } catch (err) {
      setError(err as Error)
      setCompany(null)
      return null
    } finally {
      setLoading(false)
      fetchingRef.current = false
    }
  }, [companyId, company])

  useEffect(() => {
    if (autoFetch && companyId) {
      fetchCompany()
    } else if (!companyId) {
      setCompany(null)
      setLoading(false)
      setError(null)
    }
  }, [autoFetch, companyId, fetchCompany])

  return {
    company,
    loading,
    error,
    refetch: fetchCompany
  }
}

/**
 * Utility to invalidate a company from the cache
 */
export function invalidateCompanyCache(companyId: string): void {
  companyCache.delete(companyId)
}

/**
 * Utility to clear all cached companies
 */
export function clearCompanyCache(): void {
  companyCache.clear()
}
