import { useCallback, useEffect, useState } from "react"
import { resumeVersionsClient } from "@/api"
import type { ResumeVersion, CreateResumeVersionRequest } from "@shared/types"

interface UseResumeVersionsResult {
  versions: ResumeVersion[]
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
  createVersion: (data: CreateResumeVersionRequest) => Promise<ResumeVersion>
  deleteVersion: (slug: string) => Promise<void>
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

  const createVersion = useCallback(
    async (data: CreateResumeVersionRequest) => {
      const newVersion = await resumeVersionsClient.createVersion(data)
      setVersions((prev) => [...prev, newVersion].sort((a, b) => a.slug.localeCompare(b.slug)))
      return newVersion
    },
    []
  )

  const deleteVersion = useCallback(
    async (slug: string) => {
      await resumeVersionsClient.deleteVersion(slug)
      setVersions((prev) => prev.filter((v) => v.slug !== slug))
    },
    []
  )

  return {
    versions,
    loading,
    error,
    refetch: fetchVersions,
    createVersion,
    deleteVersion
  }
}
