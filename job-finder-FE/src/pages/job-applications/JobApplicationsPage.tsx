import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { jobMatchesClient } from "@/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { JobDetailsDialog } from "./components/JobDetailsDialog"
import { CompanyDetailsModal } from "@/components/company"
import { ROUTES } from "@/types/routes"
import type { JobMatchWithListing } from "@shared/types"
import { logger } from "@/services/logging"
import { toDate } from "@/utils/dateFormat"

function getPriorityBadge(priority: string) {
  switch (priority) {
    case "High":
      return <Badge className="bg-red-500 hover:bg-red-600">High</Badge>
    case "Medium":
      return <Badge className="bg-yellow-500 hover:bg-yellow-600">Medium</Badge>
    case "Low":
      return <Badge className="bg-green-500 hover:bg-green-600">Low</Badge>
    default:
      return <Badge variant="secondary">{priority}</Badge>
  }
}

function getScoreColor(score: number) {
  if (score >= 85) return "text-green-600 font-bold"
  if (score >= 70) return "text-yellow-600 font-semibold"
  return "text-orange-600"
}

export function JobApplicationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<JobMatchWithListing[]>([])
  const [filteredMatches, setFilteredMatches] = useState<JobMatchWithListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<JobMatchWithListing | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("score")

  // Company details modal state
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null)

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
  }, [user])

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

    // Priority filter
    if (priorityFilter !== "all") {
      filtered = filtered.filter((match) => match.applicationPriority === priorityFilter)
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
  }, [matches, searchQuery, priorityFilter, sortBy])

  const handleRowClick = (match: JobMatchWithListing) => {
    setSelectedMatch(match)
    setDialogOpen(true)
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
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Job Applications</h1>
        <p className="text-muted-foreground mt-2">AI-matched opportunities ranked by relevance</p>
      </div>

      {/* Stats Overview */}
      {!loading && matches.length > 0 && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <div className="bg-secondary p-4 rounded-lg">
            <div className="text-2xl font-bold">{matches.length}</div>
            <div className="text-sm text-muted-foreground">Total Matches</div>
          </div>
          <div className="bg-red-100 dark:bg-red-950 p-4 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {matches.filter((m) => m.applicationPriority === "High").length}
            </div>
            <div className="text-sm text-red-700 dark:text-red-400">High Priority</div>
          </div>
          <div className="bg-yellow-100 dark:bg-yellow-950 p-4 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">
              {matches.filter((m) => m.applicationPriority === "Medium").length}
            </div>
            <div className="text-sm text-yellow-700 dark:text-yellow-400">Medium Priority</div>
          </div>
          <div className="bg-green-100 dark:bg-green-950 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {matches.length > 0
                ? Math.round(matches.reduce((sum, m) => sum + m.matchScore, 0) / matches.length)
                : 0}
              %
            </div>
            <div className="text-sm text-green-700 dark:text-green-400">Avg Match Score</div>
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
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full sm:w-[140px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
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
                  setPriorityFilter("all")
                }}
              >
                Clear Filters
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead className="hidden md:table-cell">Location</TableHead>
                  <TableHead className="text-center">Score</TableHead>
                  <TableHead>Priority</TableHead>
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
                      {match.listing.companyId ? (
                        <button
                          type="button"
                          className="text-blue-600 hover:underline text-left"
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedCompanyId(match.listing.companyId!)
                          }}
                        >
                          {match.listing.companyName}
                        </button>
                      ) : (
                        <div className="text-muted-foreground">{match.listing.companyName}</div>
                      )}
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
                    <TableCell>{getPriorityBadge(match.applicationPriority)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Job Details Dialog */}
      <JobDetailsDialog
        match={selectedMatch}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onGenerateResume={handleGenerateResume}
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
