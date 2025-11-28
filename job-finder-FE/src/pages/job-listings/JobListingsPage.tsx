import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useJobListings } from "@/hooks/useJobListings"
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
} from "lucide-react"
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
    skipped: { label: "Skipped", color: "bg-red-100 text-red-800" },
  }
  const config = statusConfig[status] || statusConfig.pending
  return <Badge className={config.color}>{config.label}</Badge>
}

export function JobListingsPage() {
  const { user } = useAuth()
  const { listings, loading, deleteListing, setFilters } = useJobListings({ limit: 100 })
  const [selectedListing, setSelectedListing] = useState<JobListingRecord | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")

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
    })
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value)
    setFilters({
      search: searchTerm || undefined,
      status: value !== "all" ? (value as JobListingStatus) : undefined,
      limit: 100,
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Job Listings</h1>
        <p className="text-muted-foreground mt-2">
          All job listings discovered through scraping
        </p>
      </div>

      {/* Stats Overview */}
      {!loading && listings.length > 0 && (
        <div className="grid gap-4 md:grid-cols-5">
          <div className="bg-secondary p-4 rounded-lg">
            <div className="text-2xl font-bold">{listings.length}</div>
            <div className="text-sm text-muted-foreground">Total</div>
          </div>
          <div className="bg-gray-100 dark:bg-gray-800 p-4 rounded-lg">
            <div className="text-2xl font-bold">
              {listings.filter((l) => l.status === "pending").length}
            </div>
            <div className="text-sm text-muted-foreground">Pending</div>
          </div>
          <div className="bg-blue-100 dark:bg-blue-950 p-4 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">
              {listings.filter((l) => l.status === "analyzing").length}
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-400">Analyzing</div>
          </div>
          <div className="bg-green-100 dark:bg-green-950 p-4 rounded-lg">
            <div className="text-2xl font-bold text-green-600">
              {listings.filter((l) => l.status === "analyzed").length}
            </div>
            <div className="text-sm text-green-700 dark:text-green-400">Analyzed</div>
          </div>
          <div className="bg-red-100 dark:bg-red-950 p-4 rounded-lg">
            <div className="text-2xl font-bold text-red-600">
              {listings.filter((l) => l.status === "skipped" || l.status === "filtered").length}
            </div>
            <div className="text-sm text-red-700 dark:text-red-400">Skipped/Filtered</div>
          </div>
        </div>
      )}

      {/* Listings Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Job Listings</CardTitle>
              <CardDescription>Click on a listing to view details</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search listings..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="w-[200px]"
              />
              <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="analyzing">Analyzing</SelectItem>
                  <SelectItem value="analyzed">Analyzed</SelectItem>
                  <SelectItem value="filtered">Filtered</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={handleSearch}>
                <Search className="h-4 w-4" />
              </Button>
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
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredListings.map((listing) => (
                  <TableRow
                    key={listing.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedListing(listing)}
                  >
                    <TableCell className="font-medium max-w-[300px] truncate">
                      {listing.title}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-muted-foreground">
                      {listing.companyName}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {listing.location || "—"}
                    </TableCell>
                    <TableCell>{getStatusBadge(listing.status)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!selectedListing} onOpenChange={(open) => !open && setSelectedListing(null)}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
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

              <div className="space-y-4">
                {/* ID */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                    ID
                  </Label>
                  <p className="mt-1 text-sm font-mono text-muted-foreground">
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

                {/* Source ID */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                    Source ID
                  </Label>
                  <p className="mt-1 text-sm font-mono">
                    {selectedListing.sourceId || "—"}
                  </p>
                </div>

                {/* Company ID */}
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">
                    Company ID
                  </Label>
                  <p className="mt-1 text-sm font-mono">
                    {selectedListing.companyId || "—"}
                  </p>
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
                    <pre className="mt-1 text-sm bg-muted p-2 rounded overflow-auto max-h-[100px]">
                      {JSON.stringify(selectedListing.filterResult, null, 2)}
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
                  <div className="mt-1 text-sm bg-muted p-3 rounded max-h-[200px] overflow-auto whitespace-pre-wrap">
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

              <DialogFooter className="flex justify-between sm:justify-between">
                <Button variant="destructive" onClick={() => handleDelete(selectedListing.id)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
                <Button variant="ghost" onClick={() => setSelectedListing(null)}>
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
