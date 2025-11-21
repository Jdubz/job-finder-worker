import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/AuthContext"
import type { QueueItem, QueueStats } from "@shared/types"
import { useQueueItems } from "@/hooks/useQueueItems"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RefreshCw, Search, Filter, RotateCcw, Trash2, AlertCircle, Activity } from "lucide-react"
import { QueueItemCard } from "./components/QueueItemCard"
import { QueueStatsGrid } from "./components/QueueStatsGrid"
import { QueueFilters } from "./components/QueueFilters"

interface QueueFiltersType {
  status?: string
  type?: string
  source?: string
  search?: string
  dateRange?: string
}

export function QueueManagementPage() {
  const { user, isOwner } = useAuth()

  // Use the queue items hook (will show all items since editors can see all)
  const { queueItems, loading, error, updateQueueItem } = useQueueItems({ limit: 100 })

  const [filteredItems, setFilteredItems] = useState<QueueItem[]>([])
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [alert, setAlert] = useState<{ type: "success" | "error"; message: string } | null>(null)

  // Filter state
  const [filters, setFilters] = useState<QueueFiltersType>({})
  const [sortBy, setSortBy] = useState<string>("created_at")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")

  // Calculate stats when queue items change
  useEffect(() => {
    if (error) {
      setAlert({
        type: "error",
        message: "Failed to load queue data. Please try again.",
      })
      setRefreshing(false)
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
    setRefreshing(false)
    if (queueItems.length > 0) {
      setAlert(null)
    }
  }, [queueItems, error])

  // Apply filters when items or filters change
  useEffect(() => {
    applyFilters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueItems, filters, sortBy, sortOrder])

  const handleRefresh = () => {
    setRefreshing(true)
    // Real-time listener will handle the refresh
    // Just show visual feedback that we're "refreshing"
    setTimeout(() => setRefreshing(false), 500)
  }

  const applyFilters = () => {
    let filtered = [...queueItems]

    // Apply filters
    if (filters.status && filters.status !== "all") {
      filtered = filtered.filter((item) => item.status === filters.status)
    }

    if (filters.type && filters.type !== "all") {
      filtered = filtered.filter((item) => item.type === filters.type)
    }

    if (filters.source && filters.source !== "all") {
      filtered = filtered.filter((item) => item.source === filters.source)
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      filtered = filtered.filter(
        (item) =>
          item.url.toLowerCase().includes(searchLower) ||
          (item.company_name ?? "").toLowerCase().includes(searchLower) ||
          item.result_message?.toLowerCase().includes(searchLower)
      )
    }

    // Apply sorting
    filtered.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let aValue: any = (a as any)[sortBy]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let bValue: any = (b as any)[sortBy]

      // Handle dates
      if (aValue instanceof Date) {
        aValue = aValue.getTime()
      } else if (aValue?.toDate) {
        aValue = aValue.toDate().getTime()
      }

      if (bValue instanceof Date) {
        bValue = bValue.getTime()
      } else if (bValue?.toDate) {
        bValue = bValue.toDate().getTime()
      }

      if (sortOrder === "asc") {
        return aValue > bValue ? 1 : -1
      } else {
        return aValue < bValue ? 1 : -1
      }
    })

    setFilteredItems(filtered as QueueItem[])
  }

  const handleRetryItem = async (id: string) => {
    try {
      // Update the queue item to pending status for retry
      await updateQueueItem(id, {
        status: "pending",
        result_message: "Queued for retry",
        processed_at: undefined,
        completed_at: undefined,
      })

      setAlert({
        type: "success",
        message: "Queue item queued for retry",
      })
    } catch (error) {
      console.error("Failed to retry item:", error)
      setAlert({
        type: "error",
        message: "Failed to retry queue item",
      })
    }
  }

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

  const handleBulkAction = async (action: "retry" | "cancel") => {
    if (selectedItems.size === 0) return

    try {
      const promises = Array.from(selectedItems).map((id) => {
        if (action === "retry") {
          return updateQueueItem(id, {
            status: "pending",
            result_message: "Queued for retry",
            processed_at: undefined,
            completed_at: undefined,
          })
        } else {
          return updateQueueItem(id, {
            status: "skipped",
            result_message: "Cancelled by user",
            completed_at: new Date(),
          })
        }
      })

      await Promise.all(promises)
      setAlert({
        type: "success",
        message: `${action === "retry" ? "Retried" : "Cancelled"} ${selectedItems.size} items`,
      })
      setSelectedItems(new Set())
    } catch {
      setAlert({
        type: "error",
        message: `Failed to ${action} selected items`,
      })
    }
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
              className="flex items-center gap-1 bg-green-50 text-green-700 border-green-200"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              Live
            </Badge>
          </div>
          <p className="text-muted-foreground mt-2">
            Monitor and manage the job processing queue in real-time
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {selectedItems.size > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={() => handleBulkAction("retry")}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Retry ({selectedItems.size})
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleBulkAction("cancel")}>
                <Trash2 className="h-4 w-4 mr-2" />
                Cancel ({selectedItems.size})
              </Button>
            </>
          )}
        </div>
      </div>

      {alert && (
        <Alert variant={alert.type === "error" ? "destructive" : "default"}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {/* Queue Statistics */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : (
        queueStats && <QueueStatsGrid stats={queueStats} />
      )}

      {/* Queue Management Interface */}
      <Tabs defaultValue="items" className="space-y-4">
        <TabsList>
          <TabsTrigger value="items" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Queue Items
          </TabsTrigger>
          <TabsTrigger value="filters" className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters & Search
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="space-y-4">
          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Status:</label>
              <Select
                value={filters.status || "all"}
                onValueChange={(value) =>
                  setFilters({ ...filters, status: value === "all" ? undefined : value })
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                  <SelectItem value="filtered">Filtered</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Type:</label>
              <Select
                value={filters.type || "all"}
                onValueChange={(value) =>
                  setFilters({ ...filters, type: value === "all" ? undefined : value })
                }
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="job">Job</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                  <SelectItem value="scrape">Scrape</SelectItem>
                  <SelectItem value="source_discovery">Discovery</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search URL, company, or message..."
                value={filters.search || ""}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-64"
              />
            </div>
          </div>

          {/* Queue Items List */}
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Activity className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium text-muted-foreground mb-2">No Queue Items</h3>
                <p className="text-sm text-muted-foreground">
                  {queueItems.length === 0
                    ? "The queue is empty."
                    : "No items match the current filters."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredItems.map((item) => {
                if (!item.id) return null
                return (
                  <QueueItemCard
                    key={item.id}
                    item={item}
                    selected={selectedItems.has(item.id)}
                    onSelect={(id: string, selected: boolean) => {
                      const newSelected = new Set(selectedItems)
                      if (selected) {
                        newSelected.add(id)
                      } else {
                        newSelected.delete(id)
                      }
                      setSelectedItems(newSelected)
                    }}
                    onRetry={handleRetryItem}
                    onCancel={handleCancelItem}
                  />
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="filters">
          <QueueFilters
            filters={filters}
            onFiltersChange={setFilters}
            sortBy={sortBy}
            onSortByChange={setSortBy}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
