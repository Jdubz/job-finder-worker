import { useSource } from "@/hooks/useSource"
import { useCompany } from "@/hooks/useCompany"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ExternalLink, Loader2, Building2, AlertCircle } from "lucide-react"
import type { JobSource, JobSourceStatus } from "@shared/types"

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
  })
}

// Defensive helper: never let arbitrary objects reach React text nodes
const safeText = (value: unknown, fallback = "—") => {
  if (value === null || value === undefined || value === "") return fallback
  if (typeof value === "string" || typeof value === "number") return value
  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

function getStatusBadge(status: JobSourceStatus) {
  const statusConfig: Record<JobSourceStatus, { label: string; color: string }> = {
    active: { label: "Active", color: "bg-green-100 text-green-800" },
    paused: { label: "Paused", color: "bg-yellow-100 text-yellow-800" },
    disabled: { label: "Disabled", color: "bg-gray-100 text-gray-800" },
    error: { label: "Error", color: "bg-red-100 text-red-800" },
  }
  const config = statusConfig[status] || statusConfig.disabled
  return <Badge className={config.color}>{config.label}</Badge>
}

interface SourceDetailsModalProps {
  /** Source ID to fetch, OR pass source directly */
  sourceId?: string | null
  /** Source object if already available */
  source?: JobSource | null
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void
  /** Callback when company link is clicked */
  onCompanyClick?: (companyId: string) => void
}

/**
 * Shared source details modal component.
 * Can either receive a sourceId (will fetch data) or a source object directly.
 */
export function SourceDetailsModal({
  sourceId,
  source: providedSource,
  open,
  onOpenChange,
  onCompanyClick,
}: SourceDetailsModalProps) {
  // Use hook to fetch source if ID provided and no source object
  const { source: fetchedSource, loading, error } = useSource(
    providedSource ? null : sourceId,
    { autoFetch: open && !providedSource }
  )

  const source = providedSource || fetchedSource

  // Fetch linked company for this source
  const { company: linkedCompany, loading: companyLoading } = useCompany(
    source?.companyId ?? null,
    { autoFetch: open && !!source?.companyId }
  )

  // Extract URL from config for display
  const sourceUrl = source?.configJson?.url as string | undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading source...</span>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Failed to load source details.</p>
            <p className="text-sm mt-1">{error.message}</p>
          </div>
        ) : source ? (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div>
                  <DialogTitle className="text-xl">{safeText(source.name)}</DialogTitle>
                  <DialogDescription className="mt-1">
                    {safeText(source.sourceType, "Unknown type")}
                  </DialogDescription>
                </div>
                {getStatusBadge(source.status)}
              </div>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              {/* Source URL */}
              {sourceUrl && (
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">URL</Label>
                  <a
                    href={sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start text-blue-600 hover:underline mt-1 break-all text-sm"
                  >
                    <span className="flex-1">{safeText(sourceUrl)}</span>
                    <ExternalLink className="ml-1 h-3 w-3 flex-shrink-0 mt-1" />
                  </a>
                </div>
              )}

              {/* Source Type */}
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Source Type</Label>
                <p className="mt-1 capitalize">{safeText(source.sourceType)}</p>
              </div>

              {/* Aggregator Domain */}
              {source.aggregatorDomain && (
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Aggregator Domain</Label>
                  <p className="mt-1">{safeText(source.aggregatorDomain)}</p>
                </div>
              )}

              {/* Tags */}
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Tags</Label>
                {source.tags && source.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1 max-h-[100px] overflow-y-auto">
                    {source.tags.map((tag, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {safeText(tag)}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">—</p>
                )}
              </div>

              {/* Last Scraped */}
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Last Scraped</Label>
                <p className="mt-1">{formatDate(source.lastScrapedAt)}</p>
              </div>

              {/* Configuration (collapsed by default) */}
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Configuration</Label>
                <pre className="mt-1 text-xs bg-muted p-2 rounded max-h-[100px] overflow-y-auto">
                  {JSON.stringify(source.configJson, null, 2)}
                </pre>
              </div>

              {/* Linked Company */}
              <div className="pt-2 border-t">
                <Label className="text-muted-foreground text-xs uppercase tracking-wide flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  Linked Company
                </Label>
                {source.companyId ? (
                  companyLoading ? (
                    <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Loading company...
                    </div>
                  ) : linkedCompany ? (
                    <div className="mt-2 p-2 bg-muted rounded">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{safeText(linkedCompany.name)}</p>
                          {linkedCompany.industry && (
                            <p className="text-xs text-muted-foreground">{linkedCompany.industry}</p>
                          )}
                        </div>
                        {onCompanyClick && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-blue-600"
                            onClick={() => onCompanyClick(source.companyId!)}
                          >
                            View Details
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2">
                      <p className="text-xs font-mono text-muted-foreground">{source.companyId}</p>
                      <p className="text-xs text-muted-foreground mt-1">Company record not found</p>
                    </div>
                  )
                ) : (
                  <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
                    <AlertCircle className="h-3 w-3" />
                    No company linked
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Created</Label>
                  <p className="mt-1 text-sm text-muted-foreground">{formatDate(source.createdAt)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Updated</Label>
                  <p className="mt-1 text-sm text-muted-foreground">{formatDate(source.updatedAt)}</p>
                </div>
              </div>
            </div>

            <DialogFooter className="pt-4 border-t flex-shrink-0 mt-4">
              <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
                Close
              </Button>
            </DialogFooter>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No source selected</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
