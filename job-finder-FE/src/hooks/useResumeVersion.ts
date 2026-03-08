import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { resumeVersionsClient } from "@/api"
import type {
  ResumeVersion,
  ResumeItem,
  ResumeItemNode,
  CreateResumeItemData,
  UpdateResumeItemData
} from "@shared/types"

interface UseResumeVersionResult {
  version: ResumeVersion | null
  items: ResumeItemNode[]
  loading: boolean
  error: Error | null
  publishing: boolean
  createItem: (data: CreateResumeItemData) => Promise<ResumeItem>
  updateItem: (id: string, data: UpdateResumeItemData) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  reorderItem: (id: string, parentId: string | null, orderIndex: number) => Promise<void>
  publish: () => Promise<void>
  refetch: () => Promise<void>
}

export function useResumeVersion(slug: string): UseResumeVersionResult {
  const { user } = useAuth()

  const [version, setVersion] = useState<ResumeVersion | null>(null)
  const [items, setItems] = useState<ResumeItemNode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [publishing, setPublishing] = useState(false)

  const userEmail = user?.email ?? null

  const fetchData = useCallback(async () => {
    if (!slug) return
    setLoading(true)
    try {
      const data = await resumeVersionsClient.getVersion(slug)
      setVersion(data.version)
      setItems(data.items)
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [slug])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const ensureAuth = useCallback(() => {
    if (!userEmail) throw new Error("User authentication required")
    return { userEmail }
  }, [userEmail])

  const createItem = useCallback(
    async (data: CreateResumeItemData) => {
      const auth = ensureAuth()
      const created = await resumeVersionsClient.createItem(slug, auth.userEmail, data)
      await fetchData()
      return created
    },
    [slug, ensureAuth, fetchData]
  )

  const updateItem = useCallback(
    async (id: string, data: UpdateResumeItemData) => {
      const auth = ensureAuth()
      await resumeVersionsClient.updateItem(slug, id, auth.userEmail, data)
      await fetchData()
    },
    [slug, ensureAuth, fetchData]
  )

  const deleteItem = useCallback(
    async (id: string) => {
      ensureAuth()
      await resumeVersionsClient.deleteItem(slug, id)
      await fetchData()
    },
    [slug, ensureAuth, fetchData]
  )

  const reorderItem = useCallback(
    async (id: string, parentId: string | null, orderIndex: number) => {
      const auth = ensureAuth()
      await resumeVersionsClient.reorderItem(slug, id, auth.userEmail, parentId, orderIndex)
      await fetchData()
    },
    [slug, ensureAuth, fetchData]
  )

  const publish = useCallback(async () => {
    ensureAuth()
    setPublishing(true)
    try {
      const result = await resumeVersionsClient.publish(slug)
      setVersion(result.version)
      // Refetch to get updated version data
      await fetchData()
    } finally {
      setPublishing(false)
    }
  }, [slug, ensureAuth, fetchData])

  const refetch = useCallback(async () => {
    await fetchData()
  }, [fetchData])

  return {
    version,
    items,
    loading,
    error,
    publishing,
    createItem,
    updateItem,
    deleteItem,
    reorderItem,
    publish,
    refetch
  }
}
