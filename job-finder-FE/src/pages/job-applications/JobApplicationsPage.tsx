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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Loader2, Search, Briefcase } from "lucide-react"
import { ROUTES } from "@/types/routes"
import type { JobMatchWithListing } from "@shared/types"
import { logger } from "@/services/logging"
import { toDate } from "@/utils/dateFormat"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { getScoreColor, SCORE_THRESHOLDS } from "@/lib/score-utils"

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
  const [sortBy, setSortBy] = useState<string>("score")

  // Fetch stats from server
  const fetchStats = useCallback(async () => {
    if (!user) return
    try {
      const serverStats = await jobMatchesClient.getStats()
      setStats(serverStats)
    } catch (err) {
      console.error("Failed to fetch job match stats:", err)
    }
  }, [user])

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
      undefined,
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
  }, [user, fetchStats])

  // Apply filters and sorting
  useEffect(() => {
    let filtered = [...matches]

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
        case "score":
          return b.matchScore - a.matchScore
        case "date":
          return toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime()
        case "company":
          return a.listing.companyName.localeCompare(b.listing.companyName)
        default:
          return 0
      }
    })

    setFilteredMatches(filtered)
  }, [matches, searchQuery, sortBy])

  const handleRowClick = (match: JobMatchWithListing) => {
    openModal({
      type: "jobMatch",
      match,
      onGenerateResume: handleGenerateResume,
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
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="score">Score</SelectItem>
                  <SelectItem value="date">Date</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                </SelectContent>
              </Select>
              {(searchQuery.trim() || sortBy !== "score") && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setSearchQuery("")
                    setSortBy("score")
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
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
            <Table className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="hidden md:table-cell">Location</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMatches.map((match) => (
                  <TableRow
                    key={match.id}
                    className="cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
                    onClick={() => handleRowClick(match)}
                  >
                    <TableCell className="max-w-[150px] sm:max-w-[200px]">
                      <div className="font-medium truncate">{match.listing.title}</div>
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="text-blue-600 hover:underline text-left"
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
                      <div className="md:hidden text-xs text-muted-foreground mt-0.5">
                        {match.listing.location || ""}
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {match.listing.location || "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={getScoreColor(match.matchScore)}>{match.matchScore}%</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
