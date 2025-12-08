import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Briefcase, Loader2 } from "lucide-react"
import { formatDateTime } from "@/utils/dateFormat"
import { extractMatchScore } from "@/lib/score-utils"
import type { JobListingRecord, JobListingStatus } from "@shared/types"

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

interface JobListingsTableProps {
  listings: JobListingRecord[]
  loading: boolean
  onRowClick: (listing: JobListingRecord) => void
  onCompanyClick: (companyId: string | undefined) => void
}

/**
 * Table component for displaying job listings.
 */
export function JobListingsTable({
  listings,
  loading,
  onRowClick,
  onCompanyClick,
}: JobListingsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (listings.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Briefcase className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No job listings found.</p>
        <p className="text-sm">Listings will appear here once scraped from sources.</p>
      </div>
    )
  }

  return (
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
        {listings.map((listing) => (
          <TableRow
            key={listing.id}
            className="cursor-pointer hover:bg-muted/50 active:bg-muted transition-colors"
            onClick={() => onRowClick(listing)}
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
                      onCompanyClick(listing.companyId || undefined)
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
                  onCompanyClick(listing.companyId || undefined)
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
              {formatDateTime(listing.updatedAt)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
