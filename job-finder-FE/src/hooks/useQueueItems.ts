import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { queueClient } from "@/api"
import type { QueueItem, SubmitJobRequest } from "@shared/types"
import { API_CONFIG } from "@/config/api"
import {
  DEFAULT_PAGE_LIMIT,
  EVENT_LOG_MAX_SIZE,
  SSE_RECONNECT_DELAY_MS,
  SSE_GRACEFUL_RECONNECT_DELAY_MS,
} from "@/config/constants"
import { consumeSavedProviderState, registerStateProvider } from "@/lib/restart-persistence"
import { normalizeDateValue, normalizeObjectValue } from "@/utils/dateFormat"
import { logger } from "@/services/logging/FrontendLogger"

interface UseQueueItemsOptions {
  limit?: number
  status?: string
}

interface SubmitCompanyParams {
  companyName: string
  websiteUrl?: string
  companyId?: string | null
  allowReanalysis?: boolean
}

interface SubmitSourceDiscoveryParams {
  url: string
  companyName?: string
  companyId?: string | null
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected"

export interface QueueEventLogEntry {
  id: string
  timestamp: number
  event: string
  payload: unknown
}

interface UseQueueItemsResult {
  queueItems: QueueItem[]
  loading: boolean
  error: Error | null
  connectionStatus: ConnectionStatus
  eventLog: QueueEventLogEntry[]
  submitJob: (request: SubmitJobRequest) => Promise<string>
  submitCompany: (params: SubmitCompanyParams) => Promise<string>
  submitSourceDiscovery: (params: SubmitSourceDiscoveryParams) => Promise<string>
  updateQueueItem: (id: string, data: Partial<QueueItem>) => Promise<void>
  deleteQueueItem: (id: string) => Promise<void>
  refetch: () => Promise<void>
}

export function useQueueItems(options: UseQueueItemsOptions = {}): UseQueueItemsResult {
  const { limit = DEFAULT_PAGE_LIMIT, status } = options

  const [queueItems, setQueueItems] = useState<QueueItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<Error | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting")
  const [eventLog, setEventLog] = useState<QueueEventLogEntry[]>([])
  const savedQueueItems = useMemo(() => consumeSavedProviderState<QueueItem[]>("queue-items"), [])
  const streamAbortRef = useRef<AbortController | null>(null)
  const initialLoadDoneRef = useRef(false)
  const [, startTransition] = useTransition()
  const logCounterRef = useRef(0)

  const appendEventLog = useCallback((event: string, payload: unknown) => {
    logCounterRef.current += 1
    const entry: QueueEventLogEntry = {
      id: `${Date.now()}-${logCounterRef.current}`,
      timestamp: Date.now(),
      event,
      payload,
    }
    setEventLog((prev) => {
      const next = [entry, ...prev]
      // Keep last N entries to avoid unbounded growth
      return next.slice(0, EVENT_LOG_MAX_SIZE)
    })
  }, [])

  const normalizeQueueItem = useCallback((item: QueueItem): QueueItem => {
    return {
      ...item,
      created_at: normalizeDateValue(item.created_at) ?? new Date(),
      updated_at: normalizeDateValue(item.updated_at) ?? new Date(),
      processed_at: normalizeDateValue(item.processed_at ?? null) ?? undefined,
      completed_at: normalizeDateValue(item.completed_at ?? null) ?? undefined,
      // Some backends still serialize these as JSON strings; coerce to objects to keep UI stable.
      pipeline_state: normalizeObjectValue(item.pipeline_state),
      metadata: normalizeObjectValue(item.metadata),
      scraped_data: normalizeObjectValue(item.scraped_data),
    } as QueueItem
  }, [])

  useEffect(() => {
    if (!savedQueueItems || savedQueueItems.length === 0) return
    try {
      setQueueItems(savedQueueItems.map(normalizeQueueItem))
      setLoading(false)
    } catch (_err) {
      logger.warning("QueueItems", "hydrate", "Failed to hydrate queue items from restart snapshot")
    }
  }, [normalizeQueueItem, savedQueueItems])

  const fetchQueueItems = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true
    if (!silent) setLoading(true)
    try {
      const response = await queueClient.listQueueItems({ status, limit })
      setQueueItems(response.items.map(normalizeQueueItem))
      setError(null)
    } catch (err) {
      setError(err as Error)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [limit, normalizeQueueItem, status])

  useEffect(() => {
    let cancelled = false

    type QueueEventData = Partial<{
      items: QueueItem[]
      queueItem: QueueItem
      queueItemId: string
    }> &
      Record<string, unknown>

    const handleEvent = (eventName: string, data?: QueueEventData) => {
      if (cancelled) return
      appendEventLog(eventName, data ?? null)
      if (eventName === "snapshot" && data?.items) {
        const items = data.items ?? []
        setQueueItems(items.map(normalizeQueueItem))
        setLoading(false)
        return
      }

      const upsert = (queueItem: QueueItem) => {
        // Use startTransition to make SSE updates non-blocking
        // This prevents rapid updates from causing UI jank
        startTransition(() => {
          setQueueItems((prev) => {
            const normalized = normalizeQueueItem(queueItem)
            const existing = prev.find((i) => i.id === normalized.id)
            if (!existing) {
              return [normalized, ...prev]
            }
            return prev.map((item) => (item.id === normalized.id ? normalized : item))
          })
        })
      }

      if (eventName === "item.created" && data?.queueItem) {
        upsert(data.queueItem)
      } else if (eventName === "item.updated" && data?.queueItem) {
        upsert(data.queueItem)
      } else if (eventName === "item.deleted" && data?.queueItemId) {
        startTransition(() => {
          setQueueItems((prev) => prev.filter((i) => i.id !== data.queueItemId))
        })
      }
    }

    const startStream = async () => {
      setConnectionStatus("connecting")
      // Kick off an initial fetch so UI is responsive if SSE fails.
      await fetchQueueItems({ silent: initialLoadDoneRef.current })
      initialLoadDoneRef.current = true

      try {
        const controller = new AbortController()
        streamAbortRef.current = controller
        // Use credentials: include to send session cookie for authentication
        const res = await fetch(`${API_CONFIG.baseUrl}/queue/events`, {
          credentials: "include",
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          setConnectionStatus("disconnected")
          appendEventLog("connection.error", { status: res.status })
          await fetchQueueItems()
          return
        }

        setConnectionStatus("connected")
        appendEventLog("connection.open", { status: res.status })
        const reader = res.body.getReader()
        const decoder = new TextDecoder("utf-8")
        let buffer = ""

        const processBuffer = () => {
          let idx: number
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const raw = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)
            if (!raw.trim()) continue
            let eventName = "message"
            const dataLines: string[] = []
            raw.split("\n").forEach((line) => {
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim()
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trim())
              }
            })
            const dataStr = dataLines.join("\n")
            if (!dataStr) continue
            try {
              const parsed = JSON.parse(dataStr)
              handleEvent(eventName, parsed)
            } catch {
              /* ignore malformed event */
            }
          }
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          processBuffer()
        }
        buffer += decoder.decode()
        processBuffer()

        // Stream ended gracefully (e.g., Cloudflare timeout) - reconnect
        if (!cancelled) {
          setConnectionStatus("connecting")
          logger.info("QueueItems", "sseReconnect", "Queue event stream ended gracefully; reconnecting")
          appendEventLog("connection.end", { reason: "graceful" })
          fetchQueueItems({ silent: true })
          setTimeout(() => {
            if (!cancelled) void startStream()
          }, SSE_GRACEFUL_RECONNECT_DELAY_MS)
        }
        return
      } catch (error) {
        // Skip reconnects if intentionally aborted during unmount
        if (error instanceof DOMException && error.name === "AbortError") {
          setConnectionStatus("disconnected")
          appendEventLog("connection.aborted", null)
          return
        }

        if (!cancelled) {
          setConnectionStatus("connecting")
          logger.error("QueueItems", "sseDisconnect", "Queue event stream disconnected; retrying shortly", {
            error: { type: "SSEError", message: error instanceof Error ? error.message : String(error) },
          })
          appendEventLog("connection.error", { message: String(error) })
          fetchQueueItems({ silent: true })
          // Attempt to reconnect after backoff
          setTimeout(() => {
            if (!cancelled) void startStream()
          }, SSE_RECONNECT_DELAY_MS)
        }
      }
    }

    startStream()

    return () => {
      cancelled = true
      streamAbortRef.current?.abort()
    }
  }, [appendEventLog, fetchQueueItems, normalizeQueueItem])

  const submitJob = useCallback(
    async (request: SubmitJobRequest): Promise<string> => {
      const queueItem = await queueClient.submitJob({
        ...request,
        source: request.source ?? "user_submission",
        metadata: {
          ...(request.metadata ?? {}),
          ...(request.generationId
            ? {
                generationId: request.generationId,
                documentsPreGenerated: true,
              }
            : {}),
        },
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

  const submitCompany = useCallback(
    async (params: SubmitCompanyParams): Promise<string> => {
      const queueItem = await queueClient.submitCompany({
        companyName: params.companyName,
        websiteUrl: params.websiteUrl,
        companyId: params.companyId,
        source: "user_request",
        allowReanalysis: params.allowReanalysis ?? false,
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

  const submitSourceDiscovery = useCallback(
    async (params: SubmitSourceDiscoveryParams): Promise<string> => {
      const queueItem = await queueClient.submitSourceDiscovery({
        url: params.url,
        companyName: params.companyName,
        companyId: params.companyId,
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
        } catch (_err) {
          logger.warning("QueueItems", "providerHydrate", "Failed to hydrate queue items provider")
        }
      },
    })
  }, [normalizeQueueItem, queueItems])

  return {
    queueItems,
    loading,
    error,
    connectionStatus,
    eventLog,
    submitJob,
    submitCompany,
    submitSourceDiscovery,
    updateQueueItem,
    deleteQueueItem,
    refetch,
  }
}
