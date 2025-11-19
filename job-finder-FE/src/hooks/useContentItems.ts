import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { contentItemsClient } from "@/api"
import type { ContentItem } from "@shared/types"

type EditableContentItem = Omit<ContentItem, "id" | "userId" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy">

interface UseContentItemsResult {
  contentItems: ContentItem[]
  loading: boolean
  error: Error | null
  createContentItem: (data: EditableContentItem) => Promise<string>
  updateContentItem: (id: string, data: Partial<ContentItem>) => Promise<void>
  deleteContentItem: (id: string) => Promise<void>
  refetch: () => Promise<void>
}

export function useContentItems(): UseContentItemsResult {
  const { user } = useAuth()

  const [contentItems, setContentItems] = useState<ContentItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)

  const normalizeContentItem = useCallback((item: ContentItem): ContentItem => ({
      ...item,
      createdAt: coerceDate(item.createdAt),
      updatedAt: coerceDate(item.updatedAt),
    }),
    []
  )

  const fetchItems = useCallback(async () => {
    if (!user?.uid) {
      setContentItems([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    try {
      const items = await contentItemsClient.list()
      setContentItems(items.map(normalizeContentItem))
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [normalizeContentItem, user?.uid])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const createContentItem = useCallback(
    async (data: EditableContentItem) => {
      if (!user?.uid) {
        throw new Error("User must be authenticated to create content items")
      }
      if (!user.email) {
        throw new Error("Account email is required to create content items")
      }

      const created = await contentItemsClient.createContentItem(user.uid, user.email, data)
      const normalized = normalizeContentItem(created)
      setContentItems((prev) =>
        [...prev.filter((item) => item.id !== normalized.id), normalized].sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0)
        )
      )
      return normalized.id
    },
    [normalizeContentItem, user?.email, user?.uid]
  )

  const updateContentItem = useCallback(
    async (id: string, data: Partial<ContentItem>) => {
      if (!user?.uid) {
        throw new Error("User must be authenticated to update content items")
      }
      if (!user.email) {
        throw new Error("Account email is required to update content items")
      }

      const updated = await contentItemsClient.updateContentItem(id, user.email, data)
      setContentItems((prev) =>
        prev.map((item) => (item.id === id ? normalizeContentItem(updated) : item))
      )
    },
    [normalizeContentItem, user?.email, user?.uid]
  )

  const deleteContentItem = useCallback(async (id: string) => {
    await contentItemsClient.deleteContentItem(id)
    setContentItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

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
    refetch,
  }
}

function coerceDate(value: unknown): Date {
  if (value instanceof Date) return value
  if (typeof value === "string" || typeof value === "number") return new Date(value)
  return new Date()
}
