import { useMemo, useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/AuthContext"
import type { QueueItem, QueueStats } from "@shared/types"
import { useQueueItems } from "@/hooks/useQueueItems"
import { configClient } from "@/api/config-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AlertCircle, Activity, Loader2, Plus, Trash2, Play, Pause } from "lucide-react"
import { ActiveQueueItem } from "./components/ActiveQueueItem"
import { ScrapeJobDialog } from "@/components/queue/ScrapeJobDialog"
import {
  getCompanyName,
  getDomain,
  getJobTitle,
  getSourceLabel,
  getStageLabel,
  getTaskTypeLabel,
} from "./components/queueItemDisplay"

type QueueStatusTone = "pending" | "processing" | "success" | "failed" | "skipped" | "filtered"

export function QueueManagementPage() {
  const { user, isOwner } = useAuth()

  const { queueItems, loading, error, updateQueueItem, refetch } = useQueueItems({ limit: 100 })

  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null)
  const [isProcessingEnabled, setIsProcessingEnabled] = useState<boolean | null>(null)
  const [isTogglingProcessing, setIsTogglingProcessing] = useState(false)
  const [confirmToggleOpen, setConfirmToggleOpen] = useState(false)

  // Calculate stats when queue items change
  useEffect(() => {
    if (error) {
      setAlert({
        type: "error",
        message: "Failed to load queue data. Please try again.",
      })
      return
    }

    // Calculate stats locally
    const stats: QueueStats = {
      total: queueItems.length,
      pending: queueItems.filter((i) => i.status === "pending").length,
      processing: queueItems.filter((i) => i.status === "processing").length,
      success: queueItems.filter((i) => i.status === "success").length,
      failed: queueItems.filter((i) => i.status === "failed").length,
      skipped: queueItems.filter((i) => i.status === "skipped").length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      filtered: queueItems.filter((i) => (i as any).status === "filtered").length,
    }
    setQueueStats(stats)
    if (queueItems.length > 0) {
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

  const statusOrder = useMemo(
    () => ({
      pending: 0,
      processing: 1,
      filtered: 2,
      success: 3,
      failed: 4,
      skipped: 5,
    }),
    []
  )

  const displayItems = useMemo(() => {
    return [...queueItems]
      .filter((item) => Boolean(item.id))
      .sort((a, b) => {
        const aWeight = statusOrder[a.status] ?? 99
        const bWeight = statusOrder[b.status] ?? 99
        if (aWeight !== bWeight) return aWeight - bWeight

        const aDate = normalizeDate(a.created_at ?? a.updated_at)
        const bDate = normalizeDate(b.created_at ?? b.updated_at)
        return aDate.getTime() - bDate.getTime()
      }) as QueueItem[]
  }, [queueItems, statusOrder])

  const processingItem = useMemo(() => {
    return [...queueItems]
      .filter((i) => i.status === "processing")
      .sort((a, b) => {
        const aDate = normalizeDate(a.processed_at ?? a.updated_at ?? a.created_at)
        const bDate = normalizeDate(b.processed_at ?? b.updated_at ?? b.created_at)
        return bDate.getTime() - aDate.getTime()
      })[0]
  }, [queueItems])

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
    const parsed = normalizeDateOrNull(date)
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

  const formatFullDate = (date: unknown): string => {
    const parsed = normalizeDateOrNull(date)
    return parsed ? parsed.toLocaleString() : "—"
  }

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
          </div>
          <p className="text-muted-foreground mt-2">
            Monitor and manage the job processing queue in real-time. Retries are temporarily
            disabled; cancel stuck items and re-submit only after fixing root causes.
          </p>
        </div>

        <div className="flex items-center gap-2">
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

      {/* Compact stats */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        queueStats && (
          <div className="flex flex-wrap gap-2 text-sm">
            <StatPill label="Total" value={queueStats.total} />
            <StatPill label="Pending" value={queueStats.pending} tone="amber" />
            <StatPill label="Processing" value={queueStats.processing} tone="blue" />
            <StatPill label="Failed" value={queueStats.failed} tone="red" />
            <StatPill label="Success" value={queueStats.success} tone="green" />
            <StatPill
              label="Success Rate"
              value={`${queueStats.total > 0 ? Math.round((queueStats.success / queueStats.total) * 100) : 0}%`}
              tone="green"
            />
          </div>
        )
      )}

      {/* Active task banner */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Activity className="h-4 w-4" />
          Now Processing
        </div>
        <ActiveQueueItem
          item={processingItem}
          loading={loading}
          onCancel={handleCancelItem}
        />
      </div>

      {/* Queue list aligned with Companies/Sources */}
      <Card>
        <CardHeader>
          <CardTitle>Task Queue</CardTitle>
          <CardDescription>Latest jobs, companies, sources, and scrape tasks</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : displayItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>The queue is empty.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead className="hidden md:table-cell">Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Updated</TableHead>
                  <TableHead className="hidden md:table-cell">Result</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {displayItems.map((item) => {
                  if (!item.id) return null
                  const title = getJobTitle(item) || getDomain(item.url) || "Untitled task"
                  const company = getCompanyName(item)
                  const source = getSourceLabel(item)
                  const typeLabel = getTaskTypeLabel(item)
                  const stageLabel = getStageLabel(item)
                  const canCancel = item.status === "pending" || item.status === "processing"

                  return (
                    <TableRow
                      key={item.id}
                      data-testid={`queue-item-${item.id}`}
                      className="cursor-pointer hover:bg-muted/60"
                      onClick={() => setSelectedItem(item)}
                    >
                      <TableCell className="font-medium max-w-[220px]">
                        <div className="flex flex-col gap-1">
                          <span className="truncate">{title}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {company || source || getDomain(item.url) || "No details yet"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          <Badge variant="outline">{typeLabel}</Badge>
                          {stageLabel && <Badge variant="secondary">{stageLabel}</Badge>}
                          {source && <Badge variant="outline">{source}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusTone(item.status)}>{item.status}</Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {formatRelativeTime(item.updated_at)}
                      </TableCell>
                      <TableCell className="hidden md:table-cell max-w-[240px] truncate text-muted-foreground">
                        {item.result_message ?? "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {canCancel && item.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCancelItem(item.id as string)
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

      <Dialog open={Boolean(selectedItem)} onOpenChange={(open) => !open && setSelectedItem(null)}>
        <DialogContent className="sm:max-w-[520px]">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle>{getJobTitle(selectedItem) || "Queue Item Details"}</DialogTitle>
                <DialogDescription>
                  {getCompanyName(selectedItem) || getDomain(selectedItem.url) || "Pending metadata"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge className={statusTone(selectedItem.status)}>{selectedItem.status}</Badge>
                  <Badge variant="outline">{getTaskTypeLabel(selectedItem)}</Badge>
                  {getStageLabel(selectedItem) && <Badge variant="secondary">{getStageLabel(selectedItem)}</Badge>}
                  {getSourceLabel(selectedItem) && <Badge variant="outline">{getSourceLabel(selectedItem)}</Badge>}
                </div>

                <div className="rounded-md border p-3 space-y-1 bg-muted/60">
                  <p className="text-xs text-muted-foreground">URL</p>
                  <a
                    className="text-primary underline break-all"
                    href={selectedItem.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {selectedItem.url}
                  </a>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <DetailField label="Created" value={formatFullDate(selectedItem.created_at)} />
                  <DetailField label="Updated" value={formatFullDate(selectedItem.updated_at)} />
                  <DetailField label="Processed" value={formatFullDate(selectedItem.processed_at)} />
                  <DetailField label="Completed" value={formatFullDate(selectedItem.completed_at)} />
                </div>

                {selectedItem.result_message && (
                  <div className="rounded-md border p-3 bg-muted/60">
                    <p className="text-xs text-muted-foreground mb-1">Result</p>
                    <p className="text-sm text-foreground">{selectedItem.result_message}</p>
                  </div>
                )}
              </div>

              <DialogFooter className="mt-4">
                {(selectedItem.status === "pending" || selectedItem.status === "processing") && (
                  <Button
                    variant="destructive"
                    onClick={() => selectedItem.id && handleCancelItem(selectedItem.id)}
                  >
                    Cancel Task
                  </Button>
                )}
                <Button variant="ghost" onClick={() => setSelectedItem(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

type StatTone = "default" | "amber" | "blue" | "red" | "green"

interface StatPillProps {
  label: string
  value: string | number
  tone?: StatTone
}

function StatPill({ label, value, tone = "default" }: StatPillProps) {
  const toneClasses: Record<StatTone, string> = {
    default: "border-muted-foreground/20 text-muted-foreground",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    blue: "border-blue-200 bg-blue-50 text-blue-800",
    red: "border-red-200 bg-red-50 text-red-800",
    green: "border-green-200 bg-green-50 text-green-800",
  }

  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium ${toneClasses[tone]}`}>
      <span className="uppercase tracking-wide text-[11px]">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  )
}

function statusTone(status: string): string {
  const tones: Record<QueueStatusTone, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    processing: "bg-blue-100 text-blue-800",
    success: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    skipped: "bg-gray-100 text-gray-800",
    filtered: "bg-orange-100 text-orange-800",
  }
  return tones[status as QueueStatusTone] ?? "bg-muted text-foreground"
}

function normalizeDate(value: unknown): Date {
  const parsed = normalizeDateOrNull(value)
  return parsed ?? new Date(0)
}

function normalizeDateOrNull(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value === "string" || typeof value === "number") return new Date(value)
  if (typeof value === "object" && "toDate" in (value as Record<string, unknown>)) {
    const maybe = (value as { toDate: () => Date }).toDate
    if (typeof maybe === "function") return maybe.call(value)
  }
  return null
}

interface DetailFieldProps {
  label: string
  value: string
}

function DetailField({ label, value }: DetailFieldProps) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  )
}
