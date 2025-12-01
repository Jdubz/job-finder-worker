import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
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
import { AlertCircle, Loader2, Plus, Rss, ExternalLink, Trash2, Search, Pause, Play, Building2 } from "lucide-react"
import { CompanyDetailsModal } from "@/components/company"
import type { JobSource, JobSourceStatus } from "@shared/types"

function formatRelativeTime(date: unknown): string {
  if (!date) return "—"
  let d: Date
  if (date instanceof Date) {
    d = date
  } else if (typeof date === "string" || typeof date === "number") {
    d = new Date(date)
  } else if (typeof date === "object" && date !== null && "toDate" in date && typeof (date as { toDate: () => Date }).toDate === "function") {
    d = (date as { toDate: () => Date }).toDate()
  } else {
    return "—"
  }
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function formatDate(date: unknown): string {
  if (!date) return "—"
  let d: Date
  if (date instanceof Date) {
    d = date
  } else if (typeof date === "string" || typeof date === "number") {
    d = new Date(date)
  } else if (typeof date === "object" && date !== null && "toDate" in date && typeof (date as { toDate: () => Date }).toDate === "function") {
    d = (date as { toDate: () => Date }).toDate()
  } else {
    return "—"
  }
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

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

export function SourcesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { sources, loading, updateSource, deleteSource, refetch, setFilters } = useJobSources({ limit: 100 })
  const { submitSourceDiscovery } = useQueueItems()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [selectedSource, setSelectedSource] = useState<JobSource | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [scrapeDialogOpen, setScrapeDialogOpen] = useState(false)
  const [scrapePrefillSourceId, setScrapePrefillSourceId] = useState<string | null>(null)

  // Company details modal state
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)

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

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this source?")) return
    try {
      await deleteSource(id)
      setSelectedSource(null)
    } catch (err) {
      console.error("Failed to delete source:", err)
    }
  }

  const handleToggleStatus = async (source: JobSource) => {
    if (!source.id) return
    const newStatus: JobSourceStatus = source.status === "active" ? "paused" : "active"
    try {
      const updated = await updateSource(source.id, { status: newStatus })
      if (selectedSource?.id === source.id) {
        setSelectedSource(updated)
      }
    } catch (err) {
      console.error("Failed to update source status:", err)
    }
  }

  const handleSearch = () => {
    setFilters({
      search: searchTerm || undefined,
      status: statusFilter !== "all" ? (statusFilter as JobSourceStatus) : undefined,
      limit: 100,
    })
  }

  // Filter sources locally for search (in addition to server-side filtering)
  const filteredSources = sources.filter((source) => {
    if (searchTerm && !source.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !source.aggregatorDomain?.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false
    }
    if (statusFilter !== "all" && source.status !== statusFilter) {
      return false
    }
    return true
  })

  const getSourceUrl = (source: JobSource): string | null => {
    if (typeof source.configJson === "object" && source.configJson !== null) {
      const config = source.configJson as Record<string, unknown>
      if (typeof config.url === "string") return config.url
    }
    return null
  }

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
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSources.map((source: JobSource) => (
                  <TableRow
                    key={source.id}
                    className="cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
                    onClick={() => setSelectedSource(source)}
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
                              setSelectedCompanyId(source.companyId!)
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
                            setSelectedCompanyId(source.companyId!)
                          }}
                        >
                          <Building2 className="h-3 w-3" />
                          View Company
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
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
      <Dialog open={!!selectedSource} onOpenChange={(open) => !open && setSelectedSource(null)}>
        <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
          {selectedSource && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <DialogTitle className="text-xl">{selectedSource.name}</DialogTitle>
                    <DialogDescription className="mt-1">
                      {selectedSource.aggregatorDomain
                        ? `Aggregator: ${selectedSource.aggregatorDomain}`
                        : selectedSource.companyId
                          ? "Company-specific source"
                          : "No company associated"}
                    </DialogDescription>
                  </div>
                  <Badge className={statusColors[selectedSource.status]}>
                    {selectedSource.status}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="space-y-4 overflow-y-auto flex-1 pr-2">
                {/* ID */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">ID</Label>
                  <p className="mt-1 text-sm font-mono text-muted-foreground break-all">{selectedSource.id || "—"}</p>
                </div>

                {/* Source URL */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Source URL</Label>
                  {(() => {
                    const url = getSourceUrl(selectedSource)
                    if (!url) {
                      return <p className="mt-1 text-muted-foreground">—</p>
                    }
                    return (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start text-blue-600 hover:underline mt-1 break-all text-sm"
                      >
                        <span className="flex-1">{url}</span>
                        <ExternalLink className="ml-1 h-3 w-3 flex-shrink-0 mt-1" />
                      </a>
                    )
                  })()}
                </div>

                {/* Type */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Type</Label>
                  <p className="mt-1">{sourceTypeLabels[selectedSource.sourceType] || selectedSource.sourceType}</p>
                </div>

                {/* Status */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Status</Label>
                  <p className="mt-1">
                    <Badge className={statusColors[selectedSource.status]}>
                      {selectedSource.status}
                    </Badge>
                  </p>
                </div>

                {/* Linked Company */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    Linked Company
                  </Label>
                  {selectedSource.companyId ? (
                    <div className="mt-1">
                      <Button
                        variant="link"
                        className="h-auto p-0 text-blue-600 hover:underline"
                        onClick={() => {
                          setSelectedCompanyId(selectedSource.companyId!)
                        }}
                      >
                        View Company Details
                      </Button>
                      <p className="text-xs font-mono text-muted-foreground mt-1">{selectedSource.companyId}</p>
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      No company linked
                    </p>
                  )}
                </div>

                {/* Aggregator Domain */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Aggregator Domain</Label>
                  <p className="mt-1">{selectedSource.aggregatorDomain || "—"}</p>
                </div>

                {/* Tags */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Tags</Label>
                  {selectedSource.tags && selectedSource.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedSource.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground">—</p>
                  )}
                </div>

                {/* Config JSON */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Config</Label>
                  <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-[120px] sm:max-h-[160px] break-all whitespace-pre-wrap">
                    {JSON.stringify(selectedSource.configJson, null, 2)}
                  </pre>
                </div>

                {/* Scraping Info */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Last Scraped</Label>
                  <p className="mt-1">{formatRelativeTime(selectedSource.lastScrapedAt)}</p>
                </div>

                {/* Timestamps */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Created</Label>
                    <p className="mt-1 text-sm text-muted-foreground">{formatDate(selectedSource.createdAt)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">Updated</Label>
                    <p className="mt-1 text-sm text-muted-foreground">{formatDate(selectedSource.updatedAt)}</p>
                  </div>
                </div>
              </div>

              <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between pt-4 border-t flex-shrink-0 mt-4">
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                  <Button
                    variant="outline"
                    onClick={() => handleToggleStatus(selectedSource)}
                    className="w-full sm:w-auto"
                  >
                    {selectedSource.status === "active" ? (
                      <>
                        <Pause className="mr-2 h-4 w-4" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Activate
                      </>
                    )}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => selectedSource.id && handleDelete(selectedSource.id)}
                    className="w-full sm:w-auto"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
                <Button variant="ghost" onClick={() => setSelectedSource(null)} className="w-full sm:w-auto">
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ScrapeJobDialog
        open={scrapeDialogOpen}
        onOpenChange={setScrapeDialogOpen}
        prefillSourceId={scrapePrefillSourceId}
        onSubmitted={refetch}
        sources={sources}
      />

      {/* Company Details Modal */}
      <CompanyDetailsModal
        companyId={selectedCompanyId}
        open={!!selectedCompanyId}
        onOpenChange={(open) => !open && setSelectedCompanyId(null)}
      />
    </div>
  )
}
