import { useMemo, useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/contexts/AuthContext"
import type { QueueItem, QueueStats } from "@shared/types"
import { useQueueItems, type ConnectionStatus } from "@/hooks/useQueueItems"
import { configClient } from "@/api/config-client"
import { queueClient } from "@/api/queue-client"
import { normalizeDateValue } from "@/utils/dateFormat"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { AlertCircle, Activity, Loader2, Plus, Play, Pause, AlertTriangle, Bug } from "lucide-react"
import { StatPill } from "@/components/ui/stat-pill"
import { ActiveQueueItem } from "./components/ActiveQueueItem"
import { ScrapeJobDialog } from "@/components/queue/ScrapeJobDialog"
import { QueueTable } from "./components/QueueTable"
type CompletedStatus = "success" | "failed" | "skipped" | "filtered"

const COMPLETED_STATUSES: CompletedStatus[] = ["success", "failed", "skipped", "filtered"]
const STATS_FETCH_DEBOUNCE_MS = 500

export function QueueManagementPage() {
  const { user, isOwner } = useAuth()
  const { openModal } = useEntityModal()

  const { queueItems, loading, error, connectionStatus, eventLog, updateQueueItem, refetch } = useQueueItems({ limit: 100 })

  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [usingFallbackStats, setUsingFallbackStats] = useState(false)
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [activeProcessingId, setActiveProcessingId] = useState<string | null>(null)
  const [processingConflictCount, setProcessingConflictCount] = useState<number>(0)
  const conflictRefetched = useRef(false)
  const [isProcessingEnabled, setIsProcessingEnabled] = useState<boolean | null>(null)
  const [isTogglingProcessing, setIsTogglingProcessing] = useState(false)
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending")
  const [completedStatusFilter, setCompletedStatusFilter] = useState<CompletedStatus | "all">("all")
  const [activeStatFilter, setActiveStatFilter] = useState<string | null>(null)
  const [showEventLog, setShowEventLog] = useState(false)

  // Handle stat pill click to filter the list
  const handleStatPillClick = useCallback((status: string) => {
    // Toggle off if already selected
    if (activeStatFilter === status) {
      setActiveStatFilter(null)
      setActiveTab("pending")
      setCompletedStatusFilter("all")
      return
    }

    setActiveStatFilter(status)

    // Route to appropriate tab and filter
    if (status === "pending" || status === "processing") {
      setActiveTab("pending")
      setCompletedStatusFilter("all")
    } else if (COMPLETED_STATUSES.includes(status as CompletedStatus)) {
      setActiveTab("completed")
      setCompletedStatusFilter(status as CompletedStatus)
    }
  }, [activeStatFilter])

  // Fetch full stats from API (not limited to 100 items)
  // Debounced to avoid rapid refetches on every SSE event
  useEffect(() => {
    if (!user || !isOwner) return

    const fetchStats = async () => {
      try {
        setStatsLoading(true)
        const stats = await queueClient.getStats()
        setQueueStats(stats)
        setUsingFallbackStats(false)
      } catch (err) {
        console.error("Failed to fetch queue stats:", err)
        // Fallback to local calculation if API fails (limited to 100 items)
        const stats: QueueStats = {
          total: queueItems.length,
          pending: queueItems.filter((i) => i.status === "pending").length,
          processing: queueItems.filter((i) => i.status === "processing").length,
          success: queueItems.filter((i) => i.status === "success").length,
          failed: queueItems.filter((i) => i.status === "failed").length,
          skipped: queueItems.filter((i) => i.status === "skipped").length,
          filtered: queueItems.filter((i) => i.status === "filtered").length,
        }
        setQueueStats(stats)
        setUsingFallbackStats(true)
      } finally {
        setStatsLoading(false)
      }
    }

    // Debounce stats fetch to avoid rapid API calls from SSE events
    const timeoutId = setTimeout(fetchStats, STATS_FETCH_DEBOUNCE_MS)
    return () => clearTimeout(timeoutId)
  }, [user, isOwner, queueItems])

  // Clear error alert when items load successfully
  useEffect(() => {
    if (error) {
      setAlert({
        type: "error",
        message: "Failed to load queue data. Please try again.",
      })
    } else if (queueItems.length > 0) {
      setAlert(null)
    }
  }, [queueItems, error])

  // Load queue settings on mount
  useEffect(() => {
    const loadQueueSettings = async () => {
      try {
        const settings = await configClient.getQueueSettings()
        // Default to true if not set
        setIsProcessingEnabled(settings?.isProcessingEnabled ?? true)
      } catch (err) {
        console.error("Failed to load queue settings:", err)
        setIsProcessingEnabled(true) // Default to enabled
      }
    }
    loadQueueSettings()
  }, [])

  const handleToggleProcessing = useCallback(async () => {
    const newValue = !isProcessingEnabled
    setIsTogglingProcessing(true)
    try {
      await configClient.updateQueueSettings({ isProcessingEnabled: newValue })
      setIsProcessingEnabled(newValue)
      setAlert({
        type: "success",
        message: newValue ? "Queue processing started" : "Queue processing paused",
      })
    } catch (err) {
      console.error("Failed to toggle processing:", err)
      setAlert({
        type: "error",
        message: "Failed to update queue processing state",
      })
    } finally {
      setIsTogglingProcessing(false)
      setConfirmToggleOpen(false)
    }
  }, [isProcessingEnabled])

  // Pending items: pending + processing, sorted chronologically (oldest first = next up)
  const pendingItems = useMemo(() => {
    return [...queueItems]
      .filter((item) => {
        if (!item.id) return false
        const isPendingOrProcessing = item.status === "pending" || item.status === "processing"
        if (!isPendingOrProcessing) return false
        // If a specific pending/processing filter is active, apply it
        if (activeStatFilter === "pending" && item.status !== "pending") return false
        if (activeStatFilter === "processing" && item.status !== "processing") return false
        return true
      })
      .sort((a, b) => {
        // Processing items first, then pending
        if (a.status === "processing" && b.status !== "processing") return -1
        if (b.status === "processing" && a.status !== "processing") return 1
        // Then by created_at ascending (oldest first = next up)
        const aDate = normalizeDate(a.created_at)
        const bDate = normalizeDate(b.created_at)
        return aDate.getTime() - bDate.getTime()
      }) as QueueItem[]
  }, [queueItems, activeStatFilter])

  // Completed items: success, failed, skipped, filtered - sorted by most recently updated first
  const completedItems = useMemo(() => {
    return [...queueItems]
      .filter((item) => {
        if (!item.id) return false
        const isCompleted = COMPLETED_STATUSES.includes(item.status as CompletedStatus)
        if (!isCompleted) return false
        if (completedStatusFilter !== "all" && item.status !== completedStatusFilter) return false
        return true
      })
      .sort((a, b) => {
        // Most recently updated first
        const aDate = normalizeDate(a.updated_at ?? a.completed_at ?? a.created_at)
        const bDate = normalizeDate(b.updated_at ?? b.completed_at ?? b.created_at)
        return bDate.getTime() - aDate.getTime()
      }) as QueueItem[]
  }, [queueItems, completedStatusFilter])

  const processingItems = useMemo(() => {
    return [...queueItems]
      .filter((i) => i.status === "processing" && i.id)
      .sort((a, b) => {
        const aDate = normalizeDate(a.processed_at ?? a.updated_at ?? a.created_at)
        const bDate = normalizeDate(b.processed_at ?? b.updated_at ?? b.created_at)
        return aDate.getTime() - bDate.getTime() // oldest first for continuity
      }) as QueueItem[]
  }, [queueItems])

  const processingItem = useMemo(() => {
    if (!activeProcessingId) return null
    return queueItems.find((i) => i.id === activeProcessingId) ?? null
  }, [activeProcessingId, queueItems])

  // Keep a stable "now processing" item and detect conflicts
  useEffect(() => {
    setProcessingConflictCount(processingItems.length > 1 ? processingItems.length : 0)

    // Auto-resync once if multiple items report as processing (should not happen)
    if (processingItems.length > 1 && !conflictRefetched.current) {
      conflictRefetched.current = true
      void refetch()
    }

    if (processingItems.length <= 1) {
      conflictRefetched.current = false
    }

    if (processingItems.length === 0) {
      if (activeProcessingId !== null) setActiveProcessingId(null)
      return
    }

    // If current is still processing, keep it; otherwise pick the oldest in-flight item
    const stillCurrent = processingItems.find((i) => i.id === activeProcessingId)
    if (stillCurrent) return

    setActiveProcessingId(processingItems[0].id ?? null)
  }, [activeProcessingId, processingItems, refetch])

  const handleCancelItem = async (id: string) => {
    try {
      // Update the queue item to cancelled status
      await updateQueueItem(id, {
        status: "skipped",
        result_message: "Cancelled by user",
        completed_at: new Date(),
      })

      setAlert({
        type: "success",
        message: "Queue item cancelled",
      })
    } catch (error) {
      console.error("Failed to cancel item:", error)
      setAlert({
        type: "error",
        message: "Failed to cancel queue item",
      })
    }
  }

  const formatRelativeTime = (date: unknown): string => {
    const parsed = normalizeDateValue(date)
    if (!parsed) return "—"
    const diffMs = Date.now() - parsed.getTime()
    const minutes = Math.floor(diffMs / 60000)
    if (minutes < 1) return "just now"
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString()

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Queue Management</h1>
          <p className="text-muted-foreground mt-2">Please sign in to access queue management</p>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You need to be signed in to access queue management features.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!isOwner) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Queue Management</h1>
          <p className="text-muted-foreground mt-2">Monitor and manage the job processing queue</p>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            You need editor permissions to access queue management.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Queue Management</h1>
            <Badge
              variant="outline"
              className={`flex items-center gap-1 ${
                isProcessingEnabled === false
                  ? "bg-amber-50 text-amber-700 border-amber-200"
                  : "bg-green-50 text-green-700 border-green-200"
              }`}
            >
              <span className="relative flex h-2 w-2">
                {isProcessingEnabled !== false && (
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${
                  isProcessingEnabled === false ? "bg-amber-500" : "bg-green-500"
                }`}></span>
              </span>
              {isProcessingEnabled === false ? "Paused" : "Live"}
            </Badge>
            <ConnectionStatusBadge status={connectionStatus} />
          </div>
          <p className="text-muted-foreground mt-2">
            Monitor and manage the job processing queue in real-time. Retries are temporarily
            disabled; cancel stuck items and re-submit only after fixing root causes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowEventLog((v) => !v)}
            className="border border-dashed border-slate-200 hover:border-slate-300"
          >
            <Bug className="h-4 w-4 mr-2" />
            {showEventLog ? "Hide" : "Show"} SSE Log
          </Button>
          {isProcessingEnabled !== null && (
            <Button
              size="sm"
              variant={isProcessingEnabled ? "outline" : "default"}
              onClick={() => setConfirmToggleOpen(true)}
              disabled={isTogglingProcessing}
              className={isProcessingEnabled ? "border-amber-300 hover:bg-amber-50" : ""}
            >
              {isTogglingProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : isProcessingEnabled ? (
                <Pause className="h-4 w-4 mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {isProcessingEnabled ? "Pause Queue" : "Start Queue"}
            </Button>
          )}
          <Button size="sm" onClick={() => setCreateOpen(true)} className="shadow-sm">
            <Plus className="h-4 w-4 mr-2" />
            Create Scrape Job
          </Button>
        </div>
      </div>

      {alert && (
        <Alert variant={alert.type === "error" ? "destructive" : "default"}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {/* Active task banner */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Activity className="h-4 w-4" />
          Now Processing
          {processingConflictCount > 1 && (
            <Badge variant="destructive" className="text-[11px]">
              Unexpected: {processingConflictCount} tasks marked processing
            </Badge>
          )}
        </div>
        <ActiveQueueItem
          item={processingItem}
          loading={loading}
          onCancel={handleCancelItem}
        />
      </div>

      {/* Compact stats - clickable to filter the list below */}
      {statsLoading || loading ? (
        <div className="flex flex-wrap gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <Skeleton key={i} className="h-10 w-24 rounded-full" />
          ))}
        </div>
      ) : (
        queueStats && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <StatPill label="Total" value={queueStats.total} />
            <StatPill
              label="Pending"
              value={queueStats.pending}
              tone="amber"
              active={activeStatFilter === "pending"}
              onClick={() => handleStatPillClick("pending")}
            />
            <StatPill
              label="Processing"
              value={queueStats.processing}
              tone="blue"
              active={activeStatFilter === "processing"}
              onClick={() => handleStatPillClick("processing")}
            />
            <StatPill
              label="Failed"
              value={queueStats.failed}
              tone="red"
              active={activeStatFilter === "failed"}
              onClick={() => handleStatPillClick("failed")}
            />
            <StatPill
              label="Skipped"
              value={queueStats.skipped}
              tone="gray"
              active={activeStatFilter === "skipped"}
              onClick={() => handleStatPillClick("skipped")}
            />
            <StatPill
              label="Filtered"
              value={queueStats.filtered}
              tone="orange"
              active={activeStatFilter === "filtered"}
              onClick={() => handleStatPillClick("filtered")}
            />
            <StatPill
              label="Success"
              value={queueStats.success}
              tone="green"
              active={activeStatFilter === "success"}
              onClick={() => handleStatPillClick("success")}
            />
            <StatPill
              label="Success Rate"
              value={`${queueStats.total > 0 ? Math.round((queueStats.success / queueStats.total) * 100) : 0}%`}
              tone="emerald"
            />
            {usingFallbackStats && (
              <div
                className="flex items-center gap-1 text-amber-600 cursor-help"
                title="Stats API unavailable. Showing counts from last 100 items only."
              >
                <AlertTriangle className="h-4 w-4" />
                <span className="text-xs">Partial data</span>
              </div>
            )}
          </div>
        )
      )}

      {/* Queue list with tabs */}
      <Card>
        <CardHeader>
          <CardTitle>Task Queue</CardTitle>
          <CardDescription>Latest jobs, companies, sources, and scrape tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "pending" | "completed")}>
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="pending">
                  Pending ({queueStats ? queueStats.pending + queueStats.processing : pendingItems.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed ({queueStats ? queueStats.success + queueStats.failed + queueStats.skipped + queueStats.filtered : completedItems.length})
                </TabsTrigger>
              </TabsList>

              {activeTab === "completed" && (
                <Select
                  value={completedStatusFilter}
                  onValueChange={(v) => setCompletedStatusFilter(v as CompletedStatus | "all")}
                >
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                    <SelectItem value="filtered">Filtered</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <TabsContent value="pending" className="mt-0">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : pendingItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No pending tasks in the queue.</p>
                </div>
              ) : (
                <QueueTable
                  items={pendingItems}
                  onRowClick={(item) =>
                    openModal({
                      type: "jobQueueItem",
                      item,
                      onCancel: () => {
                        if (item.id) return handleCancelItem(item.id)
                      },
                    })
                  }
                  onCancel={handleCancelItem}
                  formatRelativeTime={formatRelativeTime}
                />
              )}
            </TabsContent>

            <TabsContent value="completed" className="mt-0">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : completedItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No completed tasks found{completedStatusFilter !== "all" ? ` with status "${completedStatusFilter}"` : ""}.</p>
                </div>
              ) : (
                <QueueTable
                  items={completedItems}
                  onRowClick={(item) =>
                    openModal({
                      type: "jobQueueItem",
                      item,
                    })
                  }
                  onCancel={handleCancelItem}
                  formatRelativeTime={formatRelativeTime}
                />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* SSE Event log drawer */}
      <div
        className={`fixed left-0 top-24 bottom-4 w-96 bg-slate-900 text-slate-50 shadow-2xl border-r border-slate-800 transition-transform duration-300 ease-in-out transform ${
          showEventLog ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-950/60 backdrop-blur">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4" />
            <div>
              <div className="text-sm font-semibold">Incoming SSE Events</div>
              <div className="text-xs text-slate-400">Most recent first • capped at 200</div>
            </div>
          </div>
          <button
            className="text-slate-400 hover:text-white text-sm"
            onClick={() => setShowEventLog(false)}
            aria-label="Close SSE log"
          >
            Close
          </button>
        </div>
        <div className="h-full overflow-y-auto px-4 py-3 space-y-2 text-xs font-mono leading-relaxed">
          {eventLog.length === 0 ? (
            <div className="text-slate-500">No events yet</div>
          ) : (
            eventLog.map((entry) => (
              <div key={entry.id} className="bg-slate-800/70 border border-slate-700 rounded p-2">
                <div className="flex items-center justify-between text-[11px] text-slate-300">
                  <span className="uppercase tracking-wide">{entry.event}</span>
                  <span className="text-slate-500">{formatTime(entry.timestamp)}</span>
                </div>
                <pre className="mt-1 whitespace-pre-wrap break-words text-slate-100">
                  {JSON.stringify(entry.payload, null, 2)}
                </pre>
              </div>
            ))
          )}
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <ScrapeJobDialog open={createOpen} onOpenChange={setCreateOpen} onSubmitted={refetch} />
      </Dialog>

      {/* Confirm Toggle Processing Modal */}
      <Dialog open={confirmToggleOpen} onOpenChange={setConfirmToggleOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {isProcessingEnabled ? "Pause Queue Processing?" : "Start Queue Processing?"}
            </DialogTitle>
            <DialogDescription>
              {isProcessingEnabled
                ? "The worker will stop picking up new tasks from the queue. Items currently being processed will complete. Pending items will remain in the queue."
                : "The worker will resume processing pending items in the queue."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setConfirmToggleOpen(false)}>
              Cancel
            </Button>
            <Button
              variant={isProcessingEnabled ? "destructive" : "default"}
              onClick={handleToggleProcessing}
              disabled={isTogglingProcessing}
            >
              {isTogglingProcessing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : isProcessingEnabled ? (
                <Pause className="h-4 w-4 mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {isProcessingEnabled ? "Pause Processing" : "Start Processing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function normalizeDate(value: unknown): Date {
  return normalizeDateValue(value) ?? new Date(0)
}

interface ConnectionStatusBadgeProps {
  status: ConnectionStatus
}

function ConnectionStatusBadge({ status }: ConnectionStatusBadgeProps) {
  if (status === "connected") return null

  const config = {
    connecting: {
      bg: "bg-blue-50",
      text: "text-blue-700",
      border: "border-blue-200",
      label: "Connecting...",
    },
    disconnected: {
      bg: "bg-red-50",
      text: "text-red-700",
      border: "border-red-200",
      label: "Disconnected",
    },
  }[status]

  return (
    <Badge variant="outline" className={`flex items-center gap-1 ${config.bg} ${config.text} ${config.border}`}>
      <span className="relative flex h-2 w-2">
        {status === "connecting" && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${
          status === "connecting" ? "bg-blue-500" : "bg-red-500"
        }`}></span>
      </span>
      {config.label}
    </Badge>
  )
}
