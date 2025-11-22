import { useCallback, useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { queueClient } from "@/api"
import type { QueueItem } from "@shared/types"

interface UseQueueItemsOptions {
  limit?: number
  status?: string
}

interface UseQueueItemsResult {
  queueItems: QueueItem[]
  loading: boolean
  error: Error | null
  submitJob: (url: string, companyName?: string, generationId?: string) => Promise<string>
  updateQueueItem: (id: string, data: Partial<QueueItem>) => Promise<void>
  deleteQueueItem: (id: string) => Promise<void>
  refetch: () => Promise<void>
}

export function useQueueItems(options: UseQueueItemsOptions = {}): UseQueueItemsResult {
  const { user } = useAuth()
  const { limit = 50, status } = options

  const [queueItems, setQueueItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)

  const normalizeQueueItem = useCallback((item: QueueItem): QueueItem => {
    const normalize = (value: unknown): Date | null => {
      if (!value) return null
      if (value instanceof Date) return value
      if (typeof value === "string" || typeof value === "number") return new Date(value)
      return null
    }

    return {
      ...item,
      created_at: normalize(item.created_at) ?? new Date(),
      updated_at: normalize(item.updated_at) ?? new Date(),
      processed_at: normalize(item.processed_at ?? null) ?? undefined,
      completed_at: normalize(item.completed_at ?? null) ?? undefined,
    } as QueueItem
  }, [])

  const fetchQueueItems = useCallback(async () => {
    if (!user?.id) {
      setQueueItems([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    try {
      const response = await queueClient.listQueueItems({ status, limit })
      setQueueItems(response.items.map(normalizeQueueItem))
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [limit, normalizeQueueItem, status])

  useEffect(() => {
    fetchQueueItems()
  }, [fetchQueueItems])

  const submitJob = useCallback(
    async (url: string, companyName?: string, generationId?: string): Promise<string> => {
      const queueItem = await queueClient.submitJob({
        url,
        companyName,
        generationId,
        source: "user_submission",
        metadata: generationId
          ? {
              generationId,
              documentsPreGenerated: true,
            }
          : undefined,
      })

      const normalized = normalizeQueueItem(queueItem)
      setQueueItems((prev) => [normalized, ...prev])
      const id = normalized.id ?? queueItem.id
      if (!id) {
        throw new Error('Queue item ID not returned from server')
      }
      return id
    },
    [normalizeQueueItem]
  )

  const updateQueueItem = useCallback(
    async (id: string, data: Partial<QueueItem>) => {
      const updated = await queueClient.updateQueueItem(id, data)
      setQueueItems((prev) =>
        prev.map((item) => (item.id === id ? normalizeQueueItem(updated) : item))
      )
    },
    [normalizeQueueItem]
  )

  const deleteQueueItem = useCallback(async (id: string) => {
    await queueClient.deleteQueueItem(id)
    setQueueItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const refetch = useCallback(async () => {
    await fetchQueueItems()
  }, [fetchQueueItems])

  return {
    queueItems,
    loading,
    error,
    submitJob,
    updateQueueItem,
    deleteQueueItem,
    refetch,
  }
}
