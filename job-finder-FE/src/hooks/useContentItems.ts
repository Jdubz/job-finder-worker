import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { contentItemsClient } from "@/api"
import type {
  ContentItemNode,
  CreateContentItemData,
  UpdateContentItemData
} from "@shared/types"

interface UseContentItemsResult {
  contentItems: ContentItemNode[]
  loading: boolean
  error: Error | null
  createContentItem: (data: CreateContentItemData) => Promise<void>
  updateContentItem: (id: string, data: UpdateContentItemData) => Promise<void>
  deleteContentItem: (id: string) => Promise<void>
  reorderContentItem: (id: string, parentId: string | null, orderIndex: number) => Promise<void>
  refetch: () => Promise<void>
}

export function useContentItems(): UseContentItemsResult {
  const { user } = useAuth()

  const [contentItems, setContentItems] = useState<ContentItemNode[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)

  const userId = user?.id ?? null
  const userEmail = user?.email ?? null

  const fetchItems = useCallback(async () => {
    if (!userId) {
      setContentItems([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    try {
      const items = await contentItemsClient.list(userId, { includeDrafts: true })
      setContentItems(items)
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const ensureAuth = useCallback(() => {
    if (!userId || !userEmail) {
      throw new Error("User authentication required")
    }
    return { userId, userEmail }
  }, [userEmail, userId])

  const createContentItem = useCallback(
    async (data: CreateContentItemData) => {
      const auth = ensureAuth()
      await contentItemsClient.createContentItem(auth.userEmail, {
        ...data,
        userId: data.userId ?? auth.userId
      })
      await fetchItems()
    },
    [ensureAuth, fetchItems]
  )

  const updateContentItem = useCallback(
    async (id: string, data: UpdateContentItemData) => {
      const auth = ensureAuth()
      await contentItemsClient.updateContentItem(id, auth.userEmail, data)
      await fetchItems()
    },
    [ensureAuth, fetchItems]
  )

  const deleteContentItem = useCallback(
    async (id: string) => {
      ensureAuth()
      await contentItemsClient.deleteContentItem(id)
      await fetchItems()
    },
    [ensureAuth, fetchItems]
  )

  const reorderContentItem = useCallback(
    async (id: string, parentId: string | null, orderIndex: number) => {
      const auth = ensureAuth()
      await contentItemsClient.reorderContentItem(id, auth.userEmail, parentId, orderIndex)
      await fetchItems()
    },
    [ensureAuth, fetchItems]
  )

  const refetch = useCallback(async () => {
    await fetchItems()
  }, [fetchItems])

  return {
    contentItems,
    loading,
    error,
    createContentItem,
    updateContentItem,
    deleteContentItem,
    reorderContentItem,
    refetch
  }
}
