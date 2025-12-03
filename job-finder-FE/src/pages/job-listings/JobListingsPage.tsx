import { useState, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useJobListings } from "@/hooks/useJobListings"
import { useQueueItems } from "@/hooks/useQueueItems"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  AlertCircle,
  Loader2,
  Briefcase,
  Search,
  Plus,
} from "lucide-react"
import { StatPill } from "@/components/ui/stat-pill"
import type { JobListingRecord, JobListingStatus, SubmitJobRequest } from "@shared/types"

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
    analyzing: { label: "Analyzing", color: "bg-blue-100 text-blue-800" },
    analyzed: { label: "Analyzed", color: "bg-green-100 text-green-800" },
    matched: { label: "Matched", color: "bg-emerald-100 text-emerald-800" },
    skipped: { label: "Skipped", color: "bg-red-100 text-red-800" },
  }
  const config = statusConfig[status] || statusConfig.pending
  return <Badge className={config.color}>{config.label}</Badge>
}

function extractMatchScore(listing: JobListingRecord): number | null {
  // Use direct matchScore column first (populated by worker from deterministic scoring)
  if (typeof listing.matchScore === "number") return listing.matchScore

  // Fallback: extract from analysisResult.scoringResult.finalScore
  const analysis = listing.analysisResult as Record<string, unknown> | undefined
  if (!analysis) return null

  // Only use scoringResult.finalScore - the deterministic score
  const scoring = analysis["scoringResult"] as Record<string, unknown> | undefined
  if (scoring) {
    const score = scoring["finalScore"]
    if (typeof score === "number") return score
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
  const { openModal, closeModal } = useEntityModal()
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

  // Add job modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [jobUrl, setJobUrl] = useState("")
  const [jobTitle, setJobTitle] = useState("")
  const [jobDescription, setJobDescription] = useState("")
  const [jobLocation, setJobLocation] = useState("")
  const [jobTechStack, setJobTechStack] = useState("")
  const [bypassFilter, setBypassFilter] = useState(false)
  const [companyName, setCompanyName] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [deleteRequest, setDeleteRequest] = useState<{ id: string; title?: string }>({ id: "", title: "" })
  const [confirmingDelete, setConfirmingDelete] = useState(false)

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
    setJobTitle("")
    setJobDescription("")
    setJobLocation("")
    setJobTechStack("")
    setBypassFilter(false)
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
    if (!jobTitle.trim()) {
      setSubmitError("Job title is required")
      return
    }
    if (!jobDescription.trim()) {
      setSubmitError("Job description is required")
      return
    }

    try {
      setIsSubmitting(true)
      const payload: SubmitJobRequest = {
        url: jobUrl.trim(),
        companyName: companyName.trim() || undefined,
        title: jobTitle.trim(),
        description: jobDescription.trim(),
        location: jobLocation.trim() || undefined,
        techStack: jobTechStack.trim() || undefined,
        bypassFilter,
      }
      await submitJob(payload)
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

  const handleDelete = async (id: string, title?: string) => {
    setDeleteRequest({ id, title })
  }

  const handleResubmitBypass = async (listing: JobListingRecord) => {
    setSubmitError(null)
    try {
      const payload: SubmitJobRequest = {
        url: listing.url,
        companyName: listing.companyName,
        companyId: listing.companyId ?? undefined,
        title: listing.title,
        description: listing.description,
        location: listing.location ?? undefined,
        bypassFilter: true,
        metadata: { job_listing_id: listing.id },
      }
      await submitJob(payload)
      closeModal()
      navigate("/queue-management")
    } catch (err) {
      console.error("Failed to resubmit listing:", err)
      setSubmitError(err instanceof Error ? err.message : "Failed to resubmit listing")
      throw err
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
                    onClick={() =>
                      openModal({
                        type: "jobListing",
                        listing,
                        onDelete: (id) => handleDelete(id, listing.title),
                        onResubmit: () => handleResubmitBypass(listing),
                      })
                    }
                  >
                    <TableCell className="max-w-[150px] sm:max-w-[250px] md:max-w-[300px]">
                      <div className="font-medium truncate">{listing.title}</div>
                      {/* Show company and location on mobile as secondary text */}
                      <div className="md:hidden text-xs text-muted-foreground mt-0.5 flex min-w-0">
                        <span className="truncate">
                          <button
                            type="button"
                            className="text-blue-600 hover:underline"
                            onClick={(e) => {
                              e.stopPropagation()
                              openModal({
                                type: "company",
                                companyId: listing.companyId || undefined,
                              })
                            }}
                          >
                            {listing.companyName}
                          </button>
                        </span>
                        {listing.location && <span className="flex-shrink-0">{` • ${listing.location}`}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <button
                        type="button"
                        className="text-blue-600 hover:underline text-left"
                        onClick={(e) => {
                          e.stopPropagation()
                          openModal({
                            type: "company",
                            companyId: listing.companyId || undefined,
                          })
                        }}
                      >
                        {listing.companyName}
                      </button>
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

      <AlertDialog open={!!deleteRequest.id} onOpenChange={(open) => !open && setDeleteRequest({ id: "", title: "" })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete listing?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {deleteRequest.title ? `"${deleteRequest.title}"` : "this listing"} and associated analysis.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteRequest({ id: "", title: "" })}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={confirmingDelete}
              onClick={async () => {
                if (!deleteRequest.id) return
                setConfirmingDelete(true)
                try {
                  await deleteListing(deleteRequest.id)
                  closeModal()
                } catch (err) {
                  console.error("Failed to delete job listing:", err)
                  throw err
                } finally {
                  setConfirmingDelete(false)
                  setDeleteRequest({ id: "", title: "" })
                }
              }}
            >
              {confirmingDelete ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              Submit a job posting URL with key details for analysis. Title and description are required.
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
              <Label htmlFor="jobTitle">Job Title *</Label>
              <Input
                id="jobTitle"
                type="text"
                placeholder="Senior Frontend Engineer"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="jobDescription">Job Description *</Label>
              <Textarea
                id="jobDescription"
                placeholder="Paste the full job description"
                value={jobDescription}
                onChange={(e) => setJobDescription(e.target.value)}
                disabled={isSubmitting}
                className="min-h-[140px]"
              />
              <p className="text-sm text-muted-foreground">
                Providing the description avoids false negatives in keyword/tech filters.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="jobLocation">Location (optional)</Label>
                <Input
                  id="jobLocation"
                  type="text"
                  placeholder="Portland, OR or Remote"
                  value={jobLocation}
                  onChange={(e) => setJobLocation(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="techStack">Tech Stack (optional)</Label>
                <Input
                  id="techStack"
                  type="text"
                  placeholder="React, TypeScript, GraphQL"
                  value={jobTechStack}
                  onChange={(e) => setJobTechStack(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
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

            <div className="flex items-start space-x-2">
              <Checkbox
                id="bypassFilter"
                checked={bypassFilter}
                onCheckedChange={(checked) => setBypassFilter(Boolean(checked))}
                disabled={isSubmitting}
              />
              <div className="grid gap-1 leading-tight">
                <Label htmlFor="bypassFilter">Bypass intake filters</Label>
                <p className="text-sm text-muted-foreground">
                  Skip automated pre-filtering for this submission and send it directly to analysis.
                </p>
              </div>
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

    </div>
  )
}
