import { useCompany } from "@/hooks/useCompany"
import { useJobSources } from "@/hooks/useJobSources"
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
import { ExternalLink, Loader2, Database, AlertCircle } from "lucide-react"
import type { Company } from "@shared/types"

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

/** Thresholds for company data quality assessment */
const DATA_QUALITY_THRESHOLDS = {
  COMPLETE: { ABOUT: 100, CULTURE: 50 },
  PARTIAL: { ABOUT: 50, CULTURE: 25 },
} as const

function getDataStatus(company: Company): { label: string; color: string } {
  const aboutLength = (company.about || "").length
  const cultureLength = (company.culture || "").length

  if (aboutLength > DATA_QUALITY_THRESHOLDS.COMPLETE.ABOUT && cultureLength > DATA_QUALITY_THRESHOLDS.COMPLETE.CULTURE) {
    return { label: "Complete", color: "bg-green-100 text-green-800" }
  }
  if (aboutLength > DATA_QUALITY_THRESHOLDS.PARTIAL.ABOUT || cultureLength > DATA_QUALITY_THRESHOLDS.PARTIAL.CULTURE) {
    return { label: "Partial", color: "bg-yellow-100 text-yellow-800" }
  }
  return { label: "Pending", color: "bg-gray-100 text-gray-800" }
}

function CompanyStatusBadge({ company }: { company: Company }) {
  const status = getDataStatus(company)
  return <Badge className={status.color}>{status.label}</Badge>
}

interface CompanyDetailsModalProps {
  /** Company ID to fetch, OR pass company directly */
  companyId?: string | null
  /** Company object if already available */
  company?: Company | null
  /** Whether the dialog is open */
  open: boolean
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void
}

/**
 * Shared company details modal component.
 * Can either receive a companyId (will fetch data) or a company object directly.
 */
export function CompanyDetailsModal({
  companyId,
  company: providedCompany,
  open,
  onOpenChange,
}: CompanyDetailsModalProps) {
  // Use hook to fetch company if ID provided and no company object
  const { company: fetchedCompany, loading, error } = useCompany(
    providedCompany ? null : companyId,
    { autoFetch: open && !providedCompany }
  )

  const company = providedCompany || fetchedCompany

  // Fetch linked job sources for this company
  const { sources: linkedSources, loading: sourcesLoading } = useJobSources({
    companyId: company?.id ?? undefined,
    limit: 10,
    autoFetch: open && !!company?.id,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading company...</span>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Failed to load company details.</p>
            <p className="text-sm mt-1">{error.message}</p>
          </div>
        ) : company ? (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div>
                  <DialogTitle className="text-xl">{safeText(company.name)}</DialogTitle>
                  <DialogDescription className="mt-1">
                    {safeText(company.industry, "Industry not specified")}
                  </DialogDescription>
                </div>
                <CompanyStatusBadge company={company} />
              </div>
            </DialogHeader>

            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              {/* Website */}
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Website</Label>
                {company.website ? (
                  <a
                    href={company.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start text-blue-600 hover:underline mt-1 break-all text-sm"
                  >
                    <span className="flex-1">{safeText(company.website)}</span>
                    <ExternalLink className="ml-1 h-3 w-3 flex-shrink-0 mt-1" />
                  </a>
                ) : (
                  <p className="mt-1 text-muted-foreground">—</p>
                )}
              </div>

              {/* Headquarters */}
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Headquarters</Label>
                <p className="mt-1">{safeText(company.headquartersLocation)}</p>
              </div>

              {/* Company Size */}
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Company Size</Label>
                <p className="mt-1 capitalize">{safeText(company.companySizeCategory)}</p>
              </div>

              {/* Tech Stack */}
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Tech Stack</Label>
                {company.techStack && company.techStack.length > 0 ? (
                  <div className="flex flex-wrap gap-1 mt-1 max-h-[100px] overflow-y-auto">
                    {company.techStack.map((tech, index) => (
                      <Badge key={index} variant="outline" className="text-xs">
                        {safeText(tech)}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">—</p>
                )}
              </div>

              {/* About */}
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">About</Label>
                {company.about ? (
                  <div className="mt-1 text-sm bg-muted p-2 rounded max-h-[100px] overflow-y-auto">
                    {safeText(company.about)}
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">—</p>
                )}
              </div>

              {/* Culture */}
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Culture</Label>
                {company.culture ? (
                  <div className="mt-1 text-sm bg-muted p-2 rounded max-h-[100px] overflow-y-auto">
                    {safeText(company.culture)}
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">—</p>
                )}
              </div>

              {/* Mission */}
              <div>
                <Label className="text-muted-foreground text-xs uppercase tracking-wide">Mission</Label>
                {company.mission ? (
                  <div className="mt-1 text-sm bg-muted p-2 rounded max-h-[100px] overflow-y-auto">
                    {safeText(company.mission)}
                  </div>
                ) : (
                  <p className="mt-1 text-muted-foreground">—</p>
                )}
              </div>

              {/* Linked Sources */}
              <div className="pt-2 border-t">
                <Label className="text-muted-foreground text-xs uppercase tracking-wide flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  Job Sources
                </Label>
                {sourcesLoading ? (
                  <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading sources...
                  </div>
                ) : linkedSources.length > 0 ? (
                  <div className="mt-2 space-y-2">
                    {linkedSources.map((source) => (
                      <div
                        key={source.id}
                        className="flex items-center justify-between p-2 bg-muted rounded text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-medium truncate">{safeText(source.name)}</span>
                          <Badge variant="outline" className="text-xs flex-shrink-0">
                            {safeText(source.sourceType)}
                          </Badge>
                        </div>
                        <Badge
                          className={`flex-shrink-0 ${
                            source.status === "active"
                              ? "bg-green-100 text-green-800"
                              : source.status === "error"
                                ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {safeText(source.status)}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
                    <AlertCircle className="h-3 w-3" />
                    No job sources linked to this company
                  </div>
                )}
              </div>

              {/* Timestamps */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Created</Label>
                  <p className="mt-1 text-sm text-muted-foreground">{formatDate(company.createdAt)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground text-xs uppercase tracking-wide">Updated</Label>
                  <p className="mt-1 text-sm text-muted-foreground">{formatDate(company.updatedAt)}</p>
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
            <p>No company selected</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
