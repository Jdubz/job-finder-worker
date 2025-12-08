import { useState, useMemo } from "react"
import { formatDistanceToNowStrict } from "date-fns"
import { normalizeDateValue } from "@/utils/dateFormat"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { useJobSources } from "@/hooks/useJobSources"
import { useQueueItems } from "@/hooks/useQueueItems"
import { ScrapeJobDialog } from "@/components/queue/ScrapeJobDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AlertCircle, Loader2, Plus, Rss, Search, Building2 } from "lucide-react"
import type { JobSource, JobSourceStatus } from "@shared/types"

const statusColors: Record<JobSourceStatus, string> = {
  active: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  disabled: "bg-gray-100 text-gray-800",
  error: "bg-red-100 text-red-800",
}

const sourceTypeLabels: Record<string, string> = {
  api: "API",
  rss: "RSS",
  html: "HTML",
  greenhouse: "Greenhouse",
  workday: "Workday",
  lever: "Lever",
}

const formatRelativeTime = (value: unknown): string => {
  const date = normalizeDateValue(value)
  if (!date) return "—"
  return formatDistanceToNowStrict(date, { addSuffix: true })
}

export function SourcesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { openModal } = useEntityModal()
  const { sources, loading, updateSource, deleteSource, refetch, setFilters } = useJobSources({ limit: 100 })
  const { submitSourceDiscovery } = useQueueItems()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<"updated_at" | "created_at" | "name" | "last_scraped_at">("updated_at")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")
  const [scrapeDialogOpen, setScrapeDialogOpen] = useState(false)
  const [scrapePrefillSourceId, setScrapePrefillSourceId] = useState<string | null>(null)
  const [deleteRequest, setDeleteRequest] = useState<{ id: string; name?: string } | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Form state
  const [sourceUrl, setSourceUrl] = useState("")
  const [companyName, setCompanyName] = useState("")

  const resetForm = () => {
    setSourceUrl("")
    setCompanyName("")
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!sourceUrl.trim()) {
      setError("Source URL is required")
      return
    }

    try {
      setIsSubmitting(true)
      await submitSourceDiscovery({
        url: sourceUrl.trim(),
        companyName: companyName.trim() || undefined,
      })
      resetForm()
      setIsAddModalOpen(false)
      navigate("/queue-management")
    } catch (err) {
      console.error("Failed to submit source:", err)
      setError(err instanceof Error ? err.message : "Failed to submit. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = (id: string, name?: string) => {
    setDeleteRequest({ id, name })
  }

  const handleToggleStatus = async (source: JobSource) => {
    if (!source.id) return
    const newStatus: JobSourceStatus = source.status === "active" ? "paused" : "active"
    try {
      await updateSource(source.id, { status: newStatus })
    } catch (err) {
      console.error("Failed to update source status:", err)
    }
  }

  const handleSearch = () => {
    setFilters({
      search: searchTerm || undefined,
      status: statusFilter !== "all" ? (statusFilter as JobSourceStatus) : undefined,
      limit: 100,
      sortBy,
      sortOrder,
    })
  }

  const handleSortChange = (value: string) => {
    const nextSort = value as typeof sortBy
    setSortBy(nextSort)
    setFilters({
      search: searchTerm || undefined,
      status: statusFilter !== "all" ? (statusFilter as JobSourceStatus) : undefined,
      limit: 100,
      sortBy: nextSort,
      sortOrder,
    })
  }

  const handleSortOrderChange = (value: "asc" | "desc") => {
    setSortOrder(value)
    setFilters({
      search: searchTerm || undefined,
      status: statusFilter !== "all" ? (statusFilter as JobSourceStatus) : undefined,
      limit: 100,
      sortBy,
      sortOrder: value,
    })
  }

  // Filter sources locally for search (memoized)
  const filteredSources = useMemo(() => {
    return sources.filter((source) => {
      if (
        searchTerm &&
        !source.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !source.aggregatorDomain?.toLowerCase().includes(searchTerm.toLowerCase())
      ) {
        return false
      }
      if (statusFilter !== "all" && source.status !== statusFilter) {
        return false
      }
      return true
    })
  }, [sources, searchTerm, statusFilter])

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sources</h1>
          <p className="text-muted-foreground mt-2">
            Manage job sources and feeds (sign in required)
          </p>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Sign in to view sources.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sources</h1>
          <p className="text-muted-foreground mt-2">
            Job sources configured for automated scraping
          </p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Source
        </Button>
        <Dialog
          open={isAddModalOpen}
          onOpenChange={(open) => {
            setIsAddModalOpen(open)
            if (!open) resetForm()
          }}
        >
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Discover Source</DialogTitle>
              <DialogDescription>
                Enter a job board, careers page, or RSS feed URL to auto-configure scraping
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sourceUrl">
                  Source URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sourceUrl"
                  type="url"
                  placeholder="https://company.com/careers or https://boards.greenhouse.io/company"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Job board, careers page, API endpoint, or RSS feed URL
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name (Optional)</Label>
                <Input
                  id="companyName"
                  type="text"
                  placeholder="Acme Corporation"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={isSubmitting}
                />
                <p className="text-sm text-muted-foreground">
                  Leave blank to auto-detect from the source
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Discover Source"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Sources List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Configured Sources</CardTitle>
              <CardDescription>
                Click on a source to view details
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <Input
                placeholder="Search sources..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full sm:w-[200px]"
              />
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="flex-1 sm:w-[110px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortBy} onValueChange={handleSortChange}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="updated_at">Updated (newest)</SelectItem>
                    <SelectItem value="created_at">Created (newest)</SelectItem>
                    <SelectItem value="last_scraped_at">Last scraped</SelectItem>
                    <SelectItem value="name">Name (A–Z)</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={sortOrder} onValueChange={(value) => handleSortOrderChange(value as "asc" | "desc")}>
                  <SelectTrigger className="w-[110px]">
                    <SelectValue placeholder="Order" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Desc</SelectItem>
                    <SelectItem value="asc">Asc</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredSources.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Rss className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No sources found.</p>
              <p className="text-sm">Click "Add Source" to discover new sources.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Company</TableHead>
                  <TableHead>Last Scraped</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSources.map((source: JobSource) => (
                  <TableRow
                    key={source.id}
                    className="cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
                    onClick={() =>
                      openModal({
                        type: "jobSource",
                        source,
                        onToggleStatus: handleToggleStatus,
                        onDelete: (id) => handleDelete(id, source.name),
                      })
                    }
                  >
                    <TableCell>
                      <div className="font-medium">{source.name}</div>
                      {/* Show company info on mobile as secondary text */}
                      <div className="md:hidden text-xs text-muted-foreground mt-0.5">
                        {source.aggregatorDomain || (source.companyId ? (
                          <button
                            type="button"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                            onClick={(e) => {
                              e.stopPropagation()
                              openModal({
                                type: "company",
                                companyId: source.companyId || undefined,
                              })
                            }}
                          >
                            <Building2 className="h-3 w-3" />
                            Company
                          </button>
                        ) : "")}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {sourceTypeLabels[source.sourceType] || source.sourceType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[source.status]}>
                        {source.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {source.aggregatorDomain ? (
                        <span className="text-muted-foreground">{source.aggregatorDomain}</span>
                      ) : source.companyId ? (
                        <button
                          type="button"
                          className="text-blue-600 hover:underline inline-flex items-center gap-1"
                          onClick={(e) => {
                            e.stopPropagation()
                            openModal({
                              type: "company",
                              companyId: source.companyId || undefined,
                            })
                          }}
                        >
                          <Building2 className="h-3 w-3" />
                          View Company
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground text-sm">
                        {formatRelativeTime(source.lastScrapedAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (source.id) {
                            setScrapePrefillSourceId(source.id)
                            setScrapeDialogOpen(true)
                          }
                        }}
                        className="hidden sm:inline-flex"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        New scrape
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (source.id) {
                            setScrapePrefillSourceId(source.id)
                            setScrapeDialogOpen(true)
                          }
                        }}
                        className="sm:hidden h-8 w-8"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <ScrapeJobDialog
        open={scrapeDialogOpen}
        onOpenChange={setScrapeDialogOpen}
        prefillSourceId={scrapePrefillSourceId}
        onSubmitted={refetch}
        sources={sources}
      />

      <AlertDialog open={!!deleteRequest} onOpenChange={(open) => !open && setDeleteRequest(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete source?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {deleteRequest?.name ? `"${deleteRequest.name}"` : "this source"} and stop any
              scraping associated with it. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteRequest(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmingDelete}
              onClick={async () => {
                if (!deleteRequest) return
                setConfirmingDelete(true)
                try {
                  await deleteSource(deleteRequest.id)
                } catch (err) {
                  console.error("Failed to delete source:", err)
                  throw err
                } finally {
                  setConfirmingDelete(false)
                  setDeleteRequest(null)
                }
              }}
            >
              {confirmingDelete ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
