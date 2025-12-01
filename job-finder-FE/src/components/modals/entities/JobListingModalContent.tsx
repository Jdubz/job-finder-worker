import { useMemo, useState } from "react"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Trash2, ExternalLink } from "lucide-react"
import { MatchBreakdown } from "@/pages/job-listings/components/MatchBreakdown"
import type { JobListingRecord, JobListingStatus } from "@shared/types"

const statusConfig: Record<JobListingStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: "bg-gray-100 text-gray-800" },
  filtered: { label: "Filtered", color: "bg-yellow-100 text-yellow-800" },
  analyzing: { label: "Analyzing", color: "bg-blue-100 text-blue-800" },
  analyzed: { label: "Analyzed", color: "bg-green-100 text-green-800" },
  matched: { label: "Matched", color: "bg-emerald-100 text-emerald-800" },
  skipped: { label: "Skipped", color: "bg-red-100 text-red-800" },
}

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

interface JobListingModalContentProps {
  listing: JobListingRecord
  handlers?: {
    onDelete?: (id: string) => void | Promise<void>
    onResubmit?: (id: string) => void | Promise<void>
  }
}

export function JobListingModalContent({ listing, handlers }: JobListingModalContentProps) {
  const { openModal } = useEntityModal()
  const [isWorking, setIsWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matchScore = useMemo(() => extractMatchScore(listing), [listing])
  const statusBadge = statusConfig[listing.status] ?? statusConfig.pending

  const handleDelete = async () => {
    if (!handlers?.onDelete) return
    setIsWorking(true)
    setError(null)
    try {
      await handlers.onDelete(listing.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete listing")
    } finally {
      setIsWorking(false)
    }
  }

  const handleResubmit = async () => {
    if (!handlers?.onResubmit) return
    setIsWorking(true)
    setError(null)
    try {
      await handlers.onResubmit(listing.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to re-run analysis")
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 pr-2">
          <p className="text-xl font-semibold leading-tight">{listing.title}</p>
          <div className="flex items-center gap-2 text-muted-foreground">
            <button
              type="button"
              className="text-foreground hover:underline"
              onClick={() =>
                openModal({ type: "company", companyId: listing.companyId || null, company: undefined })
              }
            >
              {listing.companyName}
            </button>
            {listing.location && <span>• {listing.location}</span>}
            {listing.salaryRange && <span>• {listing.salaryRange}</span>}
          </div>
        </div>
        <Badge className={statusBadge.color}>{statusBadge.label}</Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-5 overflow-y-auto flex-1 pr-2">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">ID</Label>
            <p className="mt-1 text-sm font-mono text-muted-foreground break-all">{listing.id}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Source ID</Label>
            <p className="mt-1 text-sm font-mono text-muted-foreground break-all">
              {listing.sourceId || "—"}
            </p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Company ID</Label>
            <p className="mt-1 text-sm font-mono">{listing.companyId || "—"}</p>
          </div>
          <div className="md:col-span-2 lg:col-span-3">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">URL</Label>
            <a
              href={listing.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center text-blue-600 hover:underline mt-1 text-sm break-all"
            >
              {listing.url}
              <ExternalLink className="ml-1 h-3 w-3 flex-shrink-0" />
            </a>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Location</Label>
            <p className="mt-1">{listing.location || "—"}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Salary Range</Label>
            <p className="mt-1">{listing.salaryRange || "—"}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Posted Date</Label>
            <p className="mt-1">{listing.postedDate || "—"}</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wide">Filter Result</Label>
              {listing.filterResult ? (
                <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap break-all">
                  {JSON.stringify(listing.filterResult, null, 2)}
                </pre>
              ) : (
                <p className="mt-1 text-muted-foreground">—</p>
              )}
            </div>

            <div>
              <Label className="text-muted-foreground text-xs uppercase tracking-wide flex items-center gap-2">
                Match Analysis
                {matchScore !== null ? <Badge variant="outline">Score: {matchScore}</Badge> : null}
              </Label>
              <div className="mt-2">
                <MatchBreakdown analysis={listing.analysisResult ?? undefined} />
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Description</Label>
            <div className="text-sm bg-muted/50 p-4 rounded min-h-[200px] max-h-[60vh] overflow-auto whitespace-pre-wrap leading-relaxed">
              {listing.description || "—"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Created</Label>
            <p className="mt-1 text-sm text-muted-foreground">{formatDate(listing.createdAt)}</p>
          </div>
          <div>
            <Label className="text-muted-foreground text-xs uppercase tracking-wide">Updated</Label>
            <p className="mt-1 text-sm text-muted-foreground">{formatDate(listing.updatedAt)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between pt-4 border-t flex-shrink-0 mt-2">
        <div className="flex gap-2 flex-1">
          {handlers?.onDelete && (
            <Button variant="destructive" onClick={handleDelete} className="w-full sm:w-auto">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          )}
          {handlers?.onResubmit && (
            <Button
              variant="secondary"
              onClick={handleResubmit}
              disabled={isWorking}
              className="w-full sm:w-auto"
            >
              {isWorking ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Re-running...
                </>
              ) : (
                "Re-run (bypass filters)"
              )}
            </Button>
          )}
        </div>
        <Button variant="ghost" onClick={() => window.open(listing.url, "_blank")} className="w-full sm:w-auto">
          View Posting
        </Button>
      </div>
    </div>
  )
}
