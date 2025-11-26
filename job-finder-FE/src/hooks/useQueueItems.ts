import { useCallback, useEffect, useMemo, useState } from "react"
import { queueClient } from "@/api"
import type { QueueItem } from "@shared/types"
import { API_CONFIG } from "@/config/api"
import { consumeSavedProviderState, registerStateProvider } from "@/lib/restart-persistence"

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
  const { limit = 50, status } = options

  const [queueItems, setQueueItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const savedQueueItems = useMemo(() => consumeSavedProviderState<QueueItem[]>("queue-items"), [])

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

  useEffect(() => {
    if (!savedQueueItems || savedQueueItems.length === 0) return
    try {
      setQueueItems(savedQueueItems.map(normalizeQueueItem))
      setLoading(false)
    } catch (err) {
      console.warn("Failed to hydrate queue items from restart snapshot", err)
    }
  }, [normalizeQueueItem, savedQueueItems])

  const fetchQueueItems = useCallback(async () => {
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
    let eventSource: EventSource | null = null
    let cancelled = false

    const startStream = async () => {
      // Kick off an initial fetch so UI is responsive if SSE fails
      await fetchQueueItems()

      if (typeof EventSource === "undefined") {
        return
      }

      const url = `${API_CONFIG.baseUrl}/queue/events`
      eventSource = new EventSource(url, { withCredentials: true })

      eventSource.addEventListener("snapshot", (event) => {
        if (cancelled) return
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { items: QueueItem[] }
          setQueueItems(payload.items.map(normalizeQueueItem))
          setLoading(false)
        } catch {
          // ignore malformed snapshots
        }
      })

      const upsert = (queueItem: QueueItem) => {
        setQueueItems((prev) => {
          const normalized = normalizeQueueItem(queueItem)
          const existing = prev.find((i) => i.id === normalized.id)
          if (!existing) {
            return [normalized, ...prev]
          }
          return prev.map((item) => (item.id === normalized.id ? normalized : item))
        })
      }

      eventSource.addEventListener("item.created", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { queueItem: QueueItem }
          if (payload.queueItem) upsert(payload.queueItem)
        } catch {
          /* noop */
        }
      })

      eventSource.addEventListener("item.updated", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { queueItem: QueueItem }
          if (payload.queueItem) upsert(payload.queueItem)
        } catch {
          /* noop */
        }
      })

      eventSource.addEventListener("item.deleted", (event) => {
        try {
          const payload = JSON.parse((event as MessageEvent).data) as { queueItemId?: string }
          if (!payload.queueItemId) return
          setQueueItems((prev) => prev.filter((i) => i.id !== payload.queueItemId))
        } catch {
          /* noop */
        }
      })

      eventSource.onerror = () => {
        // Drop back to manual fetch; EventSource will auto-reconnect
        fetchQueueItems()
      }
    }

    startStream()

    return () => {
      cancelled = true
      eventSource?.close()
    }
  }, [fetchQueueItems, normalizeQueueItem])

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

  useEffect(() => {
    registerStateProvider({
      name: "queue-items",
      version: 1,
      serialize: () => queueItems,
      hydrate: (data) => {
        if (!Array.isArray(data)) return
        try {
          setQueueItems((data as QueueItem[]).map(normalizeQueueItem))
        } catch (err) {
          console.warn("Failed to hydrate queue items provider", err)
        }
      },
    })
  }, [normalizeQueueItem, queueItems])

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
