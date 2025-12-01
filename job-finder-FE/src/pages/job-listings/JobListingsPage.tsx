import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useJobListings } from "@/hooks/useJobListings"
import { useQueueItems } from "@/hooks/useQueueItems"
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
import {
  AlertCircle,
  Loader2,
  Briefcase,
  ExternalLink,
  Trash2,
  Search,
  Plus,
} from "lucide-react"
import { StatPill } from "@/components/ui/stat-pill"
import { CompanyDetailsModal } from "@/components/company"
import { SourceDetailsModal } from "@/components/source"
import { ROUTES } from "@/types/routes"
import type { JobListingRecord, JobListingStatus } from "@shared/types"

function formatDate(date: unknown): string {
  if (!date) return "—"
  let d: Date
  if (date instanceof Date) {
    d = date
  } else if (typeof date === "string" || typeof date === "number") {
    d = new Date(date)
  } else if (
    typeof date === "object" &&
    date !== null &&
    "toDate" in date &&
    typeof (date as { toDate: () => Date }).toDate === "function"
  ) {
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

function getStatusBadge(status: JobListingStatus) {
  const statusConfig: Record<JobListingStatus, { label: string; color: string }> = {
    pending: { label: "Pending", color: "bg-gray-100 text-gray-800" },
    filtered: { label: "Filtered", color: "bg-yellow-100 text-yellow-800" },
    analyzing: { label: "Analyzing", color: "bg-blue-100 text-blue-800" },
    analyzed: { label: "Analyzed", color: "bg-green-100 text-green-800" },
    matched: { label: "Matched", color: "bg-emerald-100 text-emerald-800" },
    skipped: { label: "Skipped", color: "bg-red-100 text-red-800" },
  }
  const config = statusConfig[status] || statusConfig.pending
  return <Badge className={config.color}>{config.label}</Badge>
}

function extractMatchScore(listing: JobListingRecord): number | null {
  const analysis = listing.analysisResult as Record<string, unknown> | undefined
  if (!analysis) return null
  const raw = analysis["match_score"] ?? analysis["matchScore"]
  if (typeof raw === "number") return raw
  if (typeof raw === "string") {
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function JobListingsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { listings, loading, deleteListing, setFilters } = useJobListings({
    limit: 100,
    sortBy: "updated",
    sortOrder: "desc",
  })
  const { submitJob } = useQueueItems()
  const [selectedListing, setSelectedListing] = useState<JobListingRecord | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Add job modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [jobUrl, setJobUrl] = useState("")
  const [companyName, setCompanyName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  // Company details modal state
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)

  // Source details modal state
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null)

  // Calculate status counts in a single pass for performance
  const statusCounts = useMemo(() => {
    return listings.reduce(
      (acc, listing) => {
        acc[listing.status] = (acc[listing.status] || 0) + 1
        return acc
      },
      {} as Record<JobListingStatus, number>
    )
  }, [listings])

  const resetAddForm = () => {
    setJobUrl("")
    setCompanyName("")
    setSubmitError(null)
  }

  const handleAddJobSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitError(null)

    if (!jobUrl.trim()) {
      setSubmitError("Job URL is required")
      return
    }

    try {
      setIsSubmitting(true)
      await submitJob(jobUrl.trim(), companyName.trim() || undefined)
      resetAddForm()
      setIsAddModalOpen(false)
      navigate("/queue-management")
    } catch (err) {
      console.error("Failed to submit job:", err)
      setSubmitError(err instanceof Error ? err.message : "Failed to submit. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this job listing?")) return
    try {
      await deleteListing(id)
      setSelectedListing(null)
    } catch (err) {
      console.error("Failed to delete job listing:", err)
    }
  }

  const handleSearch = () => {
    setFilters({
      search: searchTerm || undefined,
      status: statusFilter !== "all" ? (statusFilter as JobListingStatus) : undefined,
      limit: 100,
      sortBy: "updated",
      sortOrder: "desc",
    })
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    setFilters({
      search: searchTerm || undefined,
      status: value !== "all" ? (value as JobListingStatus) : undefined,
      limit: 100,
      sortBy: "updated",
      sortOrder: "desc",
    })
  }

  // Filter listings locally for immediate search feedback
  const filteredListings = listings.filter((listing) => {
    if (
      searchTerm &&
      !listing.title.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !listing.companyName.toLowerCase().includes(searchTerm.toLowerCase())
    ) {
      return false
    }
    if (statusFilter !== "all" && listing.status !== statusFilter) {
      return false
    }
    return true
  })

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job Listings</h1>
          <p className="text-muted-foreground mt-2">
            View scraped job listings (sign in required)
          </p>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Sign in to view job listings.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Job Listings</h1>
          <p className="text-muted-foreground mt-2">
            All job listings discovered through scraping
          </p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Add Job
        </Button>
      </div>

      {/* Stats Overview - Clickable Pills */}
      {!loading && listings.length > 0 && (
        <div className="flex overflow-x-auto pb-2 sm:flex-wrap items-center gap-2 text-sm scrollbar-thin">
          <StatPill
            label="Total"
            value={listings.length}
            active={statusFilter === "all"}
            onClick={() => handleStatusFilterChange("all")}
          />
          <StatPill
            label="Pending"
            value={statusCounts.pending ?? 0}
            tone="gray"
            active={statusFilter === "pending"}
            onClick={() => handleStatusFilterChange("pending")}
          />
          <StatPill
            label="Analyzing"
            value={statusCounts.analyzing ?? 0}
            tone="blue"
            active={statusFilter === "analyzing"}
            onClick={() => handleStatusFilterChange("analyzing")}
          />
          <StatPill
            label="Analyzed"
            value={statusCounts.analyzed ?? 0}
            tone="green"
            active={statusFilter === "analyzed"}
            onClick={() => handleStatusFilterChange("analyzed")}
          />
          <StatPill
            label="Matched"
            value={statusCounts.matched ?? 0}
            tone="emerald"
            active={statusFilter === "matched"}
            onClick={() => handleStatusFilterChange("matched")}
          />
          <StatPill
            label="Filtered"
            value={statusCounts.filtered ?? 0}
            tone="orange"
            active={statusFilter === "filtered"}
            onClick={() => handleStatusFilterChange("filtered")}
          />
          <StatPill
            label="Skipped"
            value={statusCounts.skipped ?? 0}
            tone="red"
            active={statusFilter === "skipped"}
            onClick={() => handleStatusFilterChange("skipped")}
          />
        </div>
      )}

      {/* Listings Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Job Listings</CardTitle>
              <CardDescription>Click on a listing to view details</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <Input
                placeholder="Search listings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-full sm:w-[200px]"
              />
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                  <SelectTrigger className="flex-1 sm:w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="analyzing">Analyzing</SelectItem>
                    <SelectItem value="analyzed">Analyzed</SelectItem>
                    <SelectItem value="filtered">Filtered</SelectItem>
                    <SelectItem value="skipped">Skipped</SelectItem>
                    <SelectItem value="matched">Matched</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" onClick={handleSearch} className="flex-shrink-0">
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
          ) : filteredListings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No job listings found.</p>
              <p className="text-sm">Listings will appear here once scraped from sources.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden md:table-cell">Company</TableHead>
                  <TableHead className="hidden lg:table-cell">Location</TableHead>
                  <TableHead className="hidden sm:table-cell">Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredListings.map((listing) => (
                  <TableRow
                    key={listing.id}
                    className="cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
                    onClick={() => setSelectedListing(listing)}
                  >
                    <TableCell className="max-w-[150px] sm:max-w-[250px] md:max-w-[300px]">
                      <div className="font-medium truncate">{listing.title}</div>
                      {/* Show company and location on mobile as secondary text */}
                      <div className="md:hidden text-xs text-muted-foreground mt-0.5 flex min-w-0">
                        <span className="truncate">
                          {listing.companyId ? (
                            <button
                              type="button"
                              className="text-blue-600 hover:underline"
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelectedCompanyId(listing.companyId!)
                              }}
                            >
                              {listing.companyName}
                            </button>
                          ) : (
                            listing.companyName
                          )}
                        </span>
                        {listing.location && <span className="flex-shrink-0">{` • ${listing.location}`}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {listing.companyId ? (
                        <button
                          type="button"
                          className="text-blue-600 hover:underline text-left"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedCompanyId(listing.companyId!)
                          }}
                        >
                          {listing.companyName}
                        </button>
                      ) : (
                        <span className="text-muted-foreground">{listing.companyName}</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {listing.location || "—"}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">
                      {(() => {
                        const score = extractMatchScore(listing)
                        return score !== null ? `${score}` : "—"
                      })()}
                    </TableCell>
                    <TableCell>{getStatusBadge(listing.status)}</TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm">
                      {formatDate(listing.updatedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedListing} onOpenChange={(open) => !open && setSelectedListing(null)}>
        <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
          {selectedListing && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1 pr-4">
                    <DialogTitle className="text-xl">{selectedListing.title}</DialogTitle>
                    <DialogDescription className="mt-1">
                      {selectedListing.companyName}
                    </DialogDescription>
                  </div>
                  {getStatusBadge(selectedListing.status)}
                </div>
              </DialogHeader>

              <div className="space-y-4 overflow-y-auto flex-1 pr-2">
                {/* ID */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                    ID
                  </Label>
                  <p className="mt-1 text-sm font-mono text-muted-foreground break-all">
                    {selectedListing.id}
                  </p>
                </div>

                {/* URL */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                    URL
                  </Label>
                  <a
                    href={selectedListing.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center text-blue-600 hover:underline mt-1 text-sm break-all"
                  >
                    {selectedListing.url}
                    <ExternalLink className="ml-1 h-3 w-3 flex-shrink-0" />
                  </a>
                </div>

                {/* Source */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                    Source
                  </Label>
                  {selectedListing.sourceId ? (
                    <div className="mt-1">
                      <Button
                        variant="link"
                        className="h-auto p-0 text-blue-600 hover:underline text-sm"
                        onClick={() => setSelectedSourceId(selectedListing.sourceId!)}
                      >
                        View Source Details
                      </Button>
                      <p className="text-xs font-mono text-muted-foreground mt-1">
                        {selectedListing.sourceId}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground flex items-center gap-1 text-sm">
                      <AlertCircle className="h-3 w-3" />
                      No source linked
                    </p>
                  )}
                </div>

                {/* Company */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                    Company
                  </Label>
                  {selectedListing.companyId ? (
                    <div className="mt-1">
                      <Button
                        variant="link"
                        className="h-auto p-0 text-blue-600 hover:underline text-sm"
                        onClick={() => setSelectedCompanyId(selectedListing.companyId!)}
                      >
                        View Company Details
                      </Button>
                      <p className="text-xs font-mono text-muted-foreground mt-1">
                        {selectedListing.companyId}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground flex items-center gap-1 text-sm">
                      <AlertCircle className="h-3 w-3" />
                      No company linked
                    </p>
                  )}
                </div>

                {/* Location */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                    Location
                  </Label>
                  <p className="mt-1">{selectedListing.location || "—"}</p>
                </div>

                {/* Salary Range */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                    Salary Range
                  </Label>
                  <p className="mt-1">{selectedListing.salaryRange || "—"}</p>
                </div>

                {/* Posted Date */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                    Posted Date
                  </Label>
                  <p className="mt-1">{selectedListing.postedDate || "—"}</p>
                </div>

                {/* Filter Result */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                    Filter Result
                  </Label>
                  {selectedListing.filterResult ? (
                    <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-[100px] sm:max-h-[120px] break-all whitespace-pre-wrap">
                      {JSON.stringify(selectedListing.filterResult, null, 2)}
                    </pre>
                  ) : (
                    <p className="mt-1 text-muted-foreground">—</p>
                  )}
                </div>

                {/* Match Analysis */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                      Match Analysis
                    </Label>
                    {(() => {
                      const score = extractMatchScore(selectedListing)
                      return score !== null ? (
                        <Badge variant="outline" className="ml-2">
                          Score: {score}
                        </Badge>
                      ) : null
                    })()}
                  </div>
                  {selectedListing.analysisResult ? (
                    <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-[150px] sm:max-h-[200px] break-all whitespace-pre-wrap">
                      {JSON.stringify(selectedListing.analysisResult, null, 2)}
                    </pre>
                  ) : (
                    <p className="mt-1 text-muted-foreground">—</p>
                  )}
                </div>

                {/* Description */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                    Description
                  </Label>
                  <div className="mt-1 text-sm bg-muted p-3 rounded max-h-[150px] sm:max-h-[200px] overflow-auto whitespace-pre-wrap break-words">
                    {selectedListing.description || "—"}
                  </div>
                </div>

                {/* Timestamps */}
                <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                      Created
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(selectedListing.createdAt)}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                      Updated
                    </Label>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatDate(selectedListing.updatedAt)}
                    </p>
                  </div>
                </div>
              </div>

              <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between pt-4 border-t flex-shrink-0 mt-4">
                <Button variant="destructive" onClick={() => handleDelete(selectedListing.id)} className="w-full sm:w-auto">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
                <div className="flex flex-col sm:flex-row gap-2">
                  {selectedListing.status === "matched" && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedListing(null)
                        navigate(ROUTES.JOB_APPLICATIONS)
                      }}
                      className="w-full sm:w-auto"
                    >
                      <Briefcase className="mr-2 h-4 w-4" />
                      View in Applications
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setSelectedListing(null)} className="w-full sm:w-auto">
                    Close
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add Job Modal */}
      <Dialog
        open={isAddModalOpen}
        onOpenChange={(open) => {
          if (!open) resetAddForm()
          setIsAddModalOpen(open)
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Job for Analysis</DialogTitle>
            <DialogDescription>
              Submit a job posting URL to analyze and add to your listings.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleAddJobSubmit} className="space-y-4">
            {submitError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{submitError}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="jobUrl">Job URL *</Label>
              <Input
                id="jobUrl"
                type="url"
                placeholder="https://example.com/careers/job-title"
                value={jobUrl}
                onChange={(e) => setJobUrl(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-sm text-muted-foreground">
                Direct link to the job posting page
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name (optional)</Label>
              <Input
                id="companyName"
                type="text"
                placeholder="Acme Inc."
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                disabled={isSubmitting}
              />
              <p className="text-sm text-muted-foreground">
                If known, helps with analysis accuracy
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsAddModalOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Job"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Company Details Modal */}
      <CompanyDetailsModal
        companyId={selectedCompanyId}
        open={!!selectedCompanyId}
        onOpenChange={(open) => !open && setSelectedCompanyId(null)}
      />

      {/* Source Details Modal */}
      <SourceDetailsModal
        sourceId={selectedSourceId}
        open={!!selectedSourceId}
        onOpenChange={(open) => !open && setSelectedSourceId(null)}
        onCompanyClick={(companyId) => {
          setSelectedSourceId(null)
          setSelectedCompanyId(companyId)
        }}
      />
    </div>
  )
}
