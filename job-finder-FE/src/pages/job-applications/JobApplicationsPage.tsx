import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { jobMatchesClient } from "@/api"
import { Button } from "@/components/ui/button"
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
import { AlertCircle, Search, SlidersHorizontal } from "lucide-react"
import { JobMatchCard } from "./components/JobMatchCard"
import { JobDetailsDialog } from "./components/JobDetailsDialog"
import { ROUTES } from "@/types/routes"
import type { JobMatch } from "@shared/types"
import { logger } from "@/services/logging"
import { toDate } from "@/utils/dateFormat"

export function JobApplicationsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [matches, setMatches] = useState<JobMatch[]>([])
  const [filteredMatches, setFilteredMatches] = useState<JobMatch[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<JobMatch | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  // Filter state
  const [searchQuery, setSearchQuery] = useState("")
  const [priorityFilter, setPriorityFilter] = useState<string>("all")
  const [sortBy, setSortBy] = useState<string>("score")

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
              companyName: updatedMatches[0].companyName,
              jobTitle: updatedMatches[0].jobTitle,
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
          match.companyName.toLowerCase().includes(query) ||
          match.jobTitle.toLowerCase().includes(query)
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
          return a.companyName.localeCompare(b.companyName)
        default:
          return 0
      }
    })

    setFilteredMatches(filtered)
  }, [matches, searchQuery, priorityFilter, sortBy])

  const handleViewDetails = (match: JobMatch) => {
    setSelectedMatch(match)
    setDialogOpen(true)
  }

  const handleGenerateResume = (match: JobMatch) => {
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
        {!user && (
          <Alert className="mt-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Sign in to see live application matches. Public viewers can explore the UI but data
              requires a login.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* Stats Overview */}
      {!loading && matches.length > 0 && (
        <div className="grid gap-4 md:grid-cols-4">
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

      {/* Filters and Search */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by company or job title..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SlidersHorizontal className="mr-2 h-4 w-4" />
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            <SelectItem value="High">High Priority</SelectItem>
            <SelectItem value="Medium">Medium Priority</SelectItem>
            <SelectItem value="Low">Low Priority</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Match Score</SelectItem>
            <SelectItem value="date">Date Added</SelectItem>
            <SelectItem value="company">Company Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Error State */}
      {error && !loading && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading State */}
      {loading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-[200px] w-full rounded-lg" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && matches.length === 0 && (
        <div className="text-center py-12">
          <div className="text-muted-foreground mb-4">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold mb-2">No job matches yet</h3>
          <p className="text-muted-foreground mb-4">
            Submit job URLs in the Job Finder to get AI-powered matches
          </p>
          <Button onClick={() => (window.location.href = "/job-finder")}>Go to Job Finder</Button>
        </div>
      )}

      {/* No Results After Filter */}
      {!loading && matches.length > 0 && filteredMatches.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No matches found for your current filters</p>
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
      )}

      {/* Job Matches Grid */}
      {!loading && filteredMatches.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredMatches.map((match) => (
            <JobMatchCard key={match.id} match={match} onViewDetails={handleViewDetails} />
          ))}
        </div>
      )}

      {/* Job Details Dialog */}
      <JobDetailsDialog
        match={selectedMatch}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onGenerateResume={handleGenerateResume}
      />
    </div>
  )
}
