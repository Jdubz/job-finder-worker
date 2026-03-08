import { useCallback, useEffect, useState } from "react"
import { resumeVersionsClient } from "@/api"
import type { ResumeVersion } from "@shared/types"

interface UseResumeVersionsResult {
  versions: ResumeVersion[]
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useResumeVersions(): UseResumeVersionsResult {
  const [versions, setVersions] = useState<ResumeVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchVersions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await resumeVersionsClient.listVersions()
      setVersions(data)
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchVersions()
  }, [fetchVersions])

  return {
    versions,
    loading,
    error,
    refetch: fetchVersions
  }
}
