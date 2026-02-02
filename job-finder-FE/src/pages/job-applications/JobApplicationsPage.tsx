import { useEffect, useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { jobMatchesClient } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { JobMatchStats } from "@shared/types"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2, Search, Briefcase, X } from "lucide-react"
import { ROUTES } from "@/types/routes"
import type { JobMatchWithListing } from "@shared/types"
import { logger } from "@/services/logging"
import { toDate, formatDate, normalizeDateValue } from "@/utils/dateFormat"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { getScoreColor, SCORE_THRESHOLDS } from "@/lib/score-utils"
import { toast } from "@/components/toast"

export function JobApplicationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { openModal } = useEntityModal()
  const [matches, setMatches] = useState<JobMatchWithListing[]>([])
  const [filteredMatches, setFilteredMatches] = useState<JobMatchWithListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Server-side stats for accurate totals (not limited by pagination)
  const [stats, setStats] = useState<JobMatchStats | null>(null)

  // Filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<string>("updated")
  const [statusFilter, setStatusFilter] = useState<"active" | "ignored" | "applied" | "all">("active")

  // Ignore confirmation dialog state
  const [ignoreDialogOpen, setIgnoreDialogOpen] = useState(false)
  const [matchToIgnore, setMatchToIgnore] = useState<JobMatchWithListing | null>(null)
  const [isIgnoring, setIsIgnoring] = useState(false)

  // Fetch stats from server
  const fetchStats = useCallback(async () => {
    if (!user) return
    try {
      const serverStats = await jobMatchesClient.getStats(statusFilter === "all" || statusFilter === "ignored")
      setStats(serverStats)
    } catch (err) {
      console.error("Failed to fetch job match stats:", err)
    }
  }, [user, statusFilter])

  // Subscribe to real-time job matches
  useEffect(() => {
    if (!user) {
      logger.debug("database", "idle", "JobApplicationsPage: No user, skipping subscription")
      setLoading(false)
      return
    }

    logger.info(
      "database",
      "started",
      "JobApplicationsPage: Subscribing to job matches for all users",
      {
        details: {},
      }
    )

    // Fetch stats on mount
    fetchStats()

    // All authenticated users see all matches (no user ownership filtering)
    const unsubscribe = jobMatchesClient.subscribeToMatches(
      (updatedMatches) => {
        logger.info(
          "database",
          "completed",
          `JobApplicationsPage: Received ${updatedMatches.length} job matches`,
          {
            details: { matchCount: updatedMatches.length },
          }
        )
        if (updatedMatches.length > 0) {
          logger.debug("database", "processing", "JobApplicationsPage: First match sample", {
            details: {
              id: updatedMatches[0].id,
              companyName: updatedMatches[0].listing.companyName,
              jobTitle: updatedMatches[0].listing.title,
              submittedBy: updatedMatches[0].submittedBy,
            },
          })
        }
        setMatches(updatedMatches)
        // Stats are fetched once on mount; avoid refetching on every real-time update
        setLoading(false)
        setError(null) // Clear any previous errors
      },
      { sortBy: "updated", sortOrder: "desc", status: statusFilter },
      (err) => {
        logger.error("database", "failed", "JobApplicationsPage: Job matches subscription error", {
          error: {
            type: err.constructor.name,
            message: err.message,
            stack: err.stack,
          },
        })
        setError("Failed to load job matches. Please refresh the page.")
        setLoading(false)
      }
    )

    return () => {
      logger.debug("database", "stopped", "JobApplicationsPage: Unsubscribing from job matches")
      unsubscribe()
    }
  }, [user, fetchStats, statusFilter])

  const getUpdatedDate = (match: JobMatchWithListing) =>
    toDate(match.updatedAt ?? match.createdAt ?? match.listing.updatedAt ?? match.listing.createdAt)

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...matches]

    // Status filter (local fallback in case backend subscription sends broader set)
    if (statusFilter !== "all") {
      filtered = filtered.filter((match) => (match.status ?? "active") === statusFilter)
    }

    // Search filter (company name or job title)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (match) =>
          match.listing.companyName.toLowerCase().includes(query) ||
          match.listing.title.toLowerCase().includes(query)
      )
    }

    // Sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "updated":
          return getUpdatedDate(b).getTime() - getUpdatedDate(a).getTime()
        case "score":
          return b.matchScore - a.matchScore
        case "date":
          return toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime()
        case "posted": {
          // Sort by job posted date (newest first), null values last
          const aPosted = normalizeDateValue(a.listing.postedDate)
          const bPosted = normalizeDateValue(b.listing.postedDate)
          if (aPosted && bPosted) {
            return bPosted.getTime() - aPosted.getTime()
          }
          return bPosted ? 1 : aPosted ? -1 : 0
        }
        case "company":
          return a.listing.companyName.localeCompare(b.listing.companyName)
        default:
          return 0
      }
    })

    setFilteredMatches(filtered)
  }, [matches, searchQuery, sortBy, statusFilter])

  const handleRowClick = (match: JobMatchWithListing) => {
    openModal({
      type: "jobMatch",
      match,
      onGenerateResume: handleGenerateResume,
      onStatusChange: (updated) => {
        setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      },
    })
  }

  const handleGenerateResume = (match: JobMatchWithListing) => {
    // Navigate to document builder with pre-filled job data
    navigate(ROUTES.DOCUMENT_BUILDER, {
      state: {
        jobMatch: match,
        documentType: "resume",
      },
    })
  }

  const handleIgnoreClick = (e: React.MouseEvent, match: JobMatchWithListing) => {
    e.stopPropagation() // Prevent row click from opening modal
    setMatchToIgnore(match)
    setIgnoreDialogOpen(true)
  }

  const handleConfirmIgnore = async () => {
    if (!matchToIgnore?.id) return

    setIsIgnoring(true)
    try {
      const updated = await jobMatchesClient.updateStatus(matchToIgnore.id, "ignored")
      setMatches((prev) => prev.map((m) => (m.id === updated.id ? updated : m)))
      toast.success({ title: "Match ignored" })
      // Refresh stats after status change
      fetchStats()
    } catch (err) {
      console.error("Failed to ignore match:", err)
      toast.error({ title: "Could not ignore match" })
    } finally {
      setIsIgnoring(false)
      setIgnoreDialogOpen(false)
      setMatchToIgnore(null)
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Matches</h1>
        <p className="text-muted-foreground mt-2">AI-ranked roles with quick filters and doc generation</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => navigate(ROUTES.DOCUMENT_BUILDER)}>
          Build Documents
        </Button>
        <Button variant="secondary" onClick={() => navigate(ROUTES.JOB_LISTINGS)}>
          Add New Job
        </Button>
      </div>

      {/* Stats Overview (using server-side stats for accuracy) */}
      {!loading && stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <div className="bg-secondary p-4 rounded-lg">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-sm text-muted-foreground">Total Matches</div>
          </div>
          <div className="bg-green-100 dark:bg-green-950 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {stats.highScore}
            </div>
            <div className="text-sm text-green-700 dark:text-green-400">Score {SCORE_THRESHOLDS.HIGH}+</div>
          </div>
          <div className="bg-yellow-100 dark:bg-yellow-950 p-4 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {stats.mediumScore}
            </div>
            <div className="text-sm text-yellow-700 dark:text-yellow-400">Score {SCORE_THRESHOLDS.MEDIUM}-{SCORE_THRESHOLDS.HIGH - 1}</div>
          </div>
          <div className="bg-blue-100 dark:bg-blue-950 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {Math.round(stats.averageScore)}%
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-400">Avg Match Score</div>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Job Matches List */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Job Matches</CardTitle>
              <CardDescription>Click on a match to view details</CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search jobs..."
                  value={searchQuery}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                  className="pl-10 w-full sm:w-[200px]"
                />
              </div>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full sm:w-[140px]" aria-label="Sort by">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated">Updated</SelectItem>
                  <SelectItem value="posted">Posted</SelectItem>
                  <SelectItem value="score">Score</SelectItem>
                  <SelectItem value="date">Created</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}>
                <SelectTrigger className="w-full sm:w-[160px]" aria-label="Status filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="applied">Applied</SelectItem>
                  <SelectItem value="ignored">Ignored</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              {(searchQuery.trim() || sortBy !== "updated") && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearchQuery("")
                    setSortBy("updated")
                    setStatusFilter("active")
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : matches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-semibold">No job matches yet</p>
              <p className="text-sm mt-1">Submit job URLs in Job Listings to get AI-powered matches</p>
              <Button className="mt-4" onClick={() => navigate(ROUTES.JOB_LISTINGS)}>
                Go to Job Listings
              </Button>
            </div>
          ) : filteredMatches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No matches found for your current filters</p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  setSearchQuery("")
                }}
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Job Title</TableHead>
                    <TableHead className="min-w-[140px]">Company</TableHead>
                    <TableHead className="hidden md:table-cell min-w-[120px]">Location</TableHead>
                    <TableHead className="hidden lg:table-cell min-w-[100px]">Posted</TableHead>
                    <TableHead className="text-center min-w-[80px]">Score</TableHead>
                    <TableHead className="text-center min-w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMatches.map((match) => (
                    <TableRow
                      key={match.id}
                      className="cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
                      onClick={() => handleRowClick(match)}
                    >
                      <TableCell className="max-w-[300px]">
                        <div className="font-medium truncate" title={match.listing.title}>
                          {match.listing.title}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        <button
                          type="button"
                          className="text-blue-600 hover:underline text-left truncate block w-full"
                          title={match.listing.companyName}
                          onClick={(e) => {
                            e.stopPropagation()
                            openModal({
                              type: "company",
                              companyId: match.listing.companyId || undefined,
                            })
                          }}
                        >
                          {match.listing.companyName}
                        </button>
                        {/* Show location on mobile as secondary text */}
                        <div className="md:hidden text-xs text-muted-foreground mt-0.5 truncate">
                          {match.listing.location || ""}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground max-w-[160px]">
                        <span className="truncate block" title={match.listing.location || undefined}>
                          {match.listing.location || "—"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground whitespace-nowrap">
                        {formatDate(match.listing.postedDate)}
                      </TableCell>
                      <TableCell className="text-center whitespace-nowrap">
                        <span className={getScoreColor(match.matchScore)}>{match.matchScore}%</span>
                      </TableCell>
                      <TableCell className="text-center">
                        {match.status !== "ignored" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                            title="Ignore this match"
                            onClick={(e) => handleIgnoreClick(e, match)}
                          >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Ignore</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ignore Confirmation Dialog */}
      <AlertDialog open={ignoreDialogOpen} onOpenChange={setIgnoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ignore this match?</AlertDialogTitle>
            <AlertDialogDescription>
              {matchToIgnore && (
                <>
                  <span className="font-medium text-foreground">{matchToIgnore.listing.title}</span>
                  {" at "}
                  <span className="font-medium text-foreground">{matchToIgnore.listing.companyName}</span>
                  {" will be moved to your ignored list. You can restore it later from the Ignored filter."}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isIgnoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmIgnore}
              disabled={isIgnoring}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isIgnoring ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Ignoring...
                </>
              ) : (
                "Ignore"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
