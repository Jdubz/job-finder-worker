import { useMemo, useState, useEffect, useCallback, useRef } from "react"
import { useAuth } from "@/contexts/AuthContext"
import type { QueueItem } from "@shared/types"
import { useQueueItems, type ConnectionStatus } from "@/hooks/useQueueItems"
import { normalizeDateValue } from "@/utils/dateFormat"
import { logger } from "@/services/logging/FrontendLogger"
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
import { Dialog } from "@/components/ui/dialog"
import { AlertCircle, Activity, Loader2, Plus, Play, Pause, AlertTriangle, Bug } from "lucide-react"
import { StatPill } from "@/components/ui/stat-pill"
import { ActiveQueueItem } from "./components/ActiveQueueItem"
import { ScrapeJobDialog } from "@/components/queue/ScrapeJobDialog"
import { QueueTable } from "./components/QueueTable"
import { useQueueStats } from "./hooks/useQueueStats"
import { useProcessingToggle } from "./hooks/useProcessingToggle"
import { SSEEventLogDrawer } from "./components/SSEEventLogDrawer"
import { ConfirmToggleDialog } from "./components/ConfirmToggleDialog"
import { queueClient } from "@/api/queue-client"

type CompletedStatus = "success" | "failed" | "skipped"
const COMPLETED_STATUSES: CompletedStatus[] = ["success", "failed", "skipped"]

export function QueueManagementPage() {
  const { user, isOwner } = useAuth()
  const { openModal } = useEntityModal()

  // Core data hook
  const { queueItems, loading, error, connectionStatus, eventLog, updateQueueItem, refetch } =
    useQueueItems({ limit: 100 })

  // Extracted hooks for better organization
  const { stats: queueStats, loading: statsLoading, usingFallback: usingFallbackStats } =
    useQueueStats({ enabled: !!user && isOwner, queueItems })

  const { isProcessingEnabled, stopReason, isToggling: isTogglingProcessing, toggleProcessing } =
    useProcessingToggle()

  // Local UI state
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [activeProcessingId, setActiveProcessingId] = useState<string | null>(null)
  const [processingConflictCount, setProcessingConflictCount] = useState<number>(0)
  const conflictRefetched = useRef(false)
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"pending" | "completed">("pending")
  const [completedStatusFilter, setCompletedStatusFilter] = useState<CompletedStatus | "all">("all")
  const [activeStatFilter, setActiveStatFilter] = useState<string | null>(null)
  const [showEventLog, setShowEventLog] = useState(false)

  // Handle stat pill click to filter the list
  const handleStatPillClick = useCallback(
    (status: string) => {
      if (activeStatFilter === status) {
        setActiveStatFilter(null)
        setActiveTab("pending")
        setCompletedStatusFilter("all")
        return
      }

      setActiveStatFilter(status)

      if (status === "pending" || status === "processing") {
        setActiveTab("pending")
        setCompletedStatusFilter("all")
      } else if (COMPLETED_STATUSES.includes(status as CompletedStatus)) {
        setActiveTab("completed")
        setCompletedStatusFilter(status as CompletedStatus)
      }
    },
    [activeStatFilter]
  )

  // Clear error alert when items load successfully
  useEffect(() => {
    if (error) {
      setAlert({ type: "error", message: "Failed to load queue data. Please try again." })
    } else if (queueItems.length > 0) {
      setAlert(null)
    }
  }, [queueItems, error])

  const handleToggleProcessing = useCallback(async () => {
    const result = await toggleProcessing()
    setAlert({ type: result.success ? "success" : "error", message: result.message })
    setConfirmToggleOpen(false)
  }, [toggleProcessing])

  // Filtered items - pending tab
  const pendingItems = useMemo(() => {
    return [...queueItems]
      .filter((item) => {
        if (!item.id) return false
        const isPendingOrProcessing = item.status === "pending" || item.status === "processing"
        if (!isPendingOrProcessing) return false
        if (activeStatFilter === "pending" && item.status !== "pending") return false
        if (activeStatFilter === "processing" && item.status !== "processing") return false
        return true
      })
      .sort((a, b) => {
        if (a.status === "processing" && b.status !== "processing") return -1
        if (b.status === "processing" && a.status !== "processing") return 1
        const aDate = normalizeDate(a.created_at)
        const bDate = normalizeDate(b.created_at)
        return aDate.getTime() - bDate.getTime()
      }) as QueueItem[]
  }, [queueItems, activeStatFilter])

  // Filtered items - completed tab
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
        const aDate = normalizeDate(a.updated_at ?? a.completed_at ?? a.created_at)
        const bDate = normalizeDate(b.updated_at ?? b.completed_at ?? b.created_at)
        return bDate.getTime() - aDate.getTime()
      }) as QueueItem[]
  }, [queueItems, completedStatusFilter])

  // Currently processing items
  const processingItems = useMemo(() => {
    return [...queueItems]
      .filter((i) => i.status === "processing" && i.id)
      .sort((a, b) => {
        const aDate = normalizeDate(a.processed_at ?? a.updated_at ?? a.created_at)
        const bDate = normalizeDate(b.processed_at ?? b.updated_at ?? b.created_at)
        return aDate.getTime() - bDate.getTime()
      }) as QueueItem[]
  }, [queueItems])

  const processingItem = useMemo(() => {
    if (!activeProcessingId) return null
    return queueItems.find((i) => i.id === activeProcessingId) ?? null
  }, [activeProcessingId, queueItems])

  // Keep a stable "now processing" item and detect conflicts
  useEffect(() => {
    setProcessingConflictCount(processingItems.length > 1 ? processingItems.length : 0)

    // Auto-resync once if multiple items report as processing
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

    const stillCurrent = processingItems.find((i) => i.id === activeProcessingId)
    if (stillCurrent) return

    setActiveProcessingId(processingItems[0].id ?? null)
  }, [activeProcessingId, processingItems, refetch])

  const handleCancelItem = async (id: string) => {
    try {
      await updateQueueItem(id, {
        status: "skipped",
        result_message: "Cancelled by user",
        completed_at: new Date(),
      })
      setAlert({ type: "success", message: "Queue item cancelled" })
    } catch (err) {
      logger.error("QueueManagement", "cancelItem", "Failed to cancel item", {
        error: { type: "CancelError", message: err instanceof Error ? err.message : String(err) },
      })
      setAlert({ type: "error", message: "Failed to cancel queue item" })
    }
  }

  const handleRetryItem = async (id: string) => {
    try {
      await queueClient.retryQueueItem(id)
      setAlert({ type: "success", message: "Task queued for retry" })
    } catch (err) {
      logger.error("QueueManagement", "retryItem", "Failed to retry item", {
        error: { type: "RetryError", message: err instanceof Error ? err.message : String(err) },
      })
      setAlert({ type: "error", message: err instanceof Error ? err.message : "Failed to retry queue item" })
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

  // Auth guards
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
          <AlertDescription>You need editor permissions to access queue management.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Queue Management</h1>
            <ProcessingStatusBadge isEnabled={isProcessingEnabled} />
            <ConnectionStatusBadge status={connectionStatus} />
          </div>
          <p className="text-muted-foreground mt-2">
            Monitor and manage the job processing queue in real-time. Failed tasks can be retried
            using the retry button.
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

      {/* Alerts */}
      {alert && (
        <Alert variant={alert.type === "error" ? "destructive" : "default"}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {stopReason && isProcessingEnabled === false && (
        <Alert
          variant="destructive"
          className="border-amber-500 bg-amber-50 text-amber-900 [&>svg]:text-amber-600"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-medium">Queue stopped automatically:</span> {stopReason}
          </AlertDescription>
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
        <ActiveQueueItem item={processingItem} loading={loading} onCancel={handleCancelItem} />
      </div>

      {/* Stats pills */}
      <QueueStatsDisplay
        stats={queueStats}
        loading={statsLoading || loading}
        usingFallback={usingFallbackStats}
        activeFilter={activeStatFilter}
        onFilterClick={handleStatPillClick}
      />

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
                  Pending (
                  {queueStats ? queueStats.pending + queueStats.processing : pendingItems.length})
                </TabsTrigger>
                <TabsTrigger value="completed">
                  Completed (
                  {queueStats
                    ? queueStats.success + queueStats.failed + queueStats.skipped
                    : completedItems.length}
                  )
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
                  onRetry={handleRetryItem}
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
                  <p>
                    No completed tasks found
                    {completedStatusFilter !== "all" ? ` with status "${completedStatusFilter}"` : ""}
                    .
                  </p>
                </div>
              ) : (
                <QueueTable
                  items={completedItems}
                  onRowClick={(item) => openModal({ type: "jobQueueItem", item })}
                  onCancel={handleCancelItem}
                  onRetry={handleRetryItem}
                  formatRelativeTime={formatRelativeTime}
                />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* SSE Event log drawer */}
      <SSEEventLogDrawer
        isOpen={showEventLog}
        onClose={() => setShowEventLog(false)}
        eventLog={eventLog}
      />

      {/* Dialogs */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <ScrapeJobDialog open={createOpen} onOpenChange={setCreateOpen} onSubmitted={refetch} />
      </Dialog>

      <ConfirmToggleDialog
        open={confirmToggleOpen}
        onOpenChange={setConfirmToggleOpen}
        isProcessingEnabled={isProcessingEnabled ?? true}
        isToggling={isTogglingProcessing}
        onConfirm={handleToggleProcessing}
      />
    </div>
  )
}

// Helper function
function normalizeDate(value: unknown): Date {
  return normalizeDateValue(value) ?? new Date(0)
}

// Sub-components

interface ProcessingStatusBadgeProps {
  isEnabled: boolean | null
}

function ProcessingStatusBadge({ isEnabled }: ProcessingStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={`flex items-center gap-1 ${
        isEnabled === false
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-green-50 text-green-700 border-green-200"
      }`}
    >
      <span className="relative flex h-2 w-2">
        {isEnabled !== false && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            isEnabled === false ? "bg-amber-500" : "bg-green-500"
          }`}
        ></span>
      </span>
      {isEnabled === false ? "Paused" : "Live"}
    </Badge>
  )
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
    <Badge
      variant="outline"
      className={`flex items-center gap-1 ${config.bg} ${config.text} ${config.border}`}
    >
      <span className="relative flex h-2 w-2">
        {status === "connecting" && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
        )}
        <span
          className={`relative inline-flex rounded-full h-2 w-2 ${
            status === "connecting" ? "bg-blue-500" : "bg-red-500"
          }`}
        ></span>
      </span>
      {config.label}
    </Badge>
  )
}

interface QueueStatsDisplayProps {
  stats: import("@shared/types").QueueStats | null
  loading: boolean
  usingFallback: boolean
  activeFilter: string | null
  onFilterClick: (status: string) => void
}

function QueueStatsDisplay({
  stats,
  loading,
  usingFallback,
  activeFilter,
  onFilterClick,
}: QueueStatsDisplayProps) {
  if (loading) {
    return (
      <div className="flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <Skeleton key={i} className="h-10 w-24 rounded-full" />
        ))}
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <StatPill label="Total" value={stats.total} />
      <StatPill
        label="Pending"
        value={stats.pending}
        tone="amber"
        active={activeFilter === "pending"}
        onClick={() => onFilterClick("pending")}
      />
      <StatPill
        label="Processing"
        value={stats.processing}
        tone="blue"
        active={activeFilter === "processing"}
        onClick={() => onFilterClick("processing")}
      />
      <StatPill
        label="Failed"
        value={stats.failed}
        tone="red"
        active={activeFilter === "failed"}
        onClick={() => onFilterClick("failed")}
      />
      <StatPill
        label="Skipped"
        value={stats.skipped}
        tone="gray"
        active={activeFilter === "skipped"}
        onClick={() => onFilterClick("skipped")}
      />
      <StatPill
        label="Success"
        value={stats.success}
        tone="green"
        active={activeFilter === "success"}
        onClick={() => onFilterClick("success")}
      />
      <StatPill
        label="Success Rate"
        value={`${stats.total > 0 ? Math.round((stats.success / stats.total) * 100) : 0}%`}
        tone="emerald"
      />
      {usingFallback && (
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
}
