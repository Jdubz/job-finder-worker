import { useMemo, useState } from "react"
import { useCompany } from "@/hooks/useCompany"
import { useJobSources } from "@/hooks/useJobSources"
import { useJobListings } from "@/hooks/useJobListings"
import { useQueueItems } from "@/hooks/useQueueItems"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ExternalLink, Loader2, Database, Building2, Briefcase, RefreshCw, Trash2 } from "lucide-react"
import { statusBadgeClass } from "@/lib/status-badge"
import { formatDate } from "@/lib/formatDate"
import type { Company, JobListingRecord } from "@shared/types"

const safeText = (value: unknown, fallback = "—") => {
  if (value === null || value === undefined || value === "") return fallback
  if (typeof value === "string" || typeof value === "number") return value
  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

const dataQualityTone: Record<string, string> = {
  Complete: statusBadgeClass("active"),
  Partial: statusBadgeClass("pending"),
  Pending: statusBadgeClass("disabled"),
}

function getDataStatus(company: Company, isPending: boolean): { label: string; tone: string } {
  if (isPending) return { label: "Pending", tone: dataQualityTone.Pending }

  const hasAbout = !!company.about?.trim()
  const hasCulture = !!company.culture?.trim()

  if (hasAbout && hasCulture) {
    return { label: "Complete", tone: dataQualityTone.Complete }
  }
  return { label: "Partial", tone: dataQualityTone.Partial }
}

interface CompanyDetailsModalContentProps {
  companyId?: string | null
  company?: Company | null
  handlers?: {
    onDelete?: (id: string) => void | Promise<void>
    onReanalyze?: (company: Company) => void | Promise<void>
  }
}

export function CompanyDetailsModalContent({ companyId, company: providedCompany, handlers }: CompanyDetailsModalContentProps) {
  const { closeModal, openModal } = useEntityModal()
  const [actionError, setActionError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isReanalyzing, setIsReanalyzing] = useState(false)

  const { company: fetchedCompany, loading, error } = useCompany(
    providedCompany ? null : companyId,
    { autoFetch: !providedCompany }
  )

  const { queueItems: pendingQueueItems } = useQueueItems({
    status: "pending",
    type: "company",
    limit: 200,
  })

  const company = providedCompany || fetchedCompany

  const handleDelete = async () => {
    if (!handlers?.onDelete || !company?.id) return
    setActionError(null)
    setIsDeleting(true)
    try {
      await handlers.onDelete(company.id)
      closeModal()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete company")
    } finally {
      setIsDeleting(false)
    }
  }

  const handleReanalyze = async () => {
    if (!handlers?.onReanalyze || !company) return
    setActionError(null)
    setIsReanalyzing(true)
    try {
      await handlers.onReanalyze(company)
      closeModal()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to re-analyze company")
    } finally {
      setIsReanalyzing(false)
    }
  }

  const hasCompanyId = !!(company?.id || companyId)

  const isPending = useMemo(() => {
    if (!company?.id) return false
    return pendingQueueItems.some((item) => item.company_id === company.id && item.status === "pending")
  }, [company?.id, pendingQueueItems])

  const { sources, loading: sourcesLoading } = useJobSources({
    companyId: company?.id ?? companyId ?? undefined,
    limit: 10,
    autoFetch: hasCompanyId,
  })

  const { listings, loading: listingsLoading } = useJobListings({
    companyId: company?.id ?? companyId ?? undefined,
    limit: hasCompanyId ? 10 : 0,
    sortBy: "updated",
    sortOrder: "desc",
  })

  const recentListings: JobListingRecord[] = useMemo(() => listings.slice(0, 5), [listings])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading company...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>Failed to load company details.</p>
        <p className="text-sm mt-1">{error.message}</p>
      </div>
    )
  }

  if (!company) {
    return <p className="text-sm text-muted-foreground">No company details available.</p>
  }

  const status = getDataStatus(company, isPending)

  return (
    <div className="space-y-4 overflow-y-auto flex-1 pr-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-lg font-semibold leading-tight">{safeText(company.name)}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {safeText(company.industry, "Industry not specified")}
          </p>
        </div>
        <Badge className={status.tone}>{status.label}</Badge>
      </div>

      <div>
        <Label className="text-muted-foreground text-xs uppercase tracking-wide">Website</Label>
        {company.website ? (
          <a
            href={company.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start text-primary hover:underline mt-1 break-all text-sm"
          >
            <span className="flex-1">{safeText(company.website)}</span>
            <ExternalLink className="ml-1 h-3 w-3 flex-shrink-0 mt-1" />
          </a>
        ) : (
          <p className="mt-1 text-muted-foreground">—</p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Headquarters</Label>
          <p className="mt-1">{safeText(company.headquartersLocation)}</p>
        </div>
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Company Size</Label>
          <p className="mt-1 capitalize">{safeText(company.companySizeCategory)}</p>
        </div>
      </div>

      <div>
        <Label className="text-muted-foreground text-xs uppercase tracking-wide">Tech Stack</Label>
        {company.techStack && company.techStack.length > 0 ? (
          <div className="flex flex-wrap gap-1 mt-1 max-h-[120px] overflow-y-auto">
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

      <div className="space-y-3">
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">About</Label>
          {company.about ? (
            <div className="mt-1 text-sm bg-muted p-3 rounded max-h-[160px] overflow-y-auto whitespace-pre-wrap">
              {safeText(company.about)}
            </div>
          ) : (
            <p className="mt-1 text-muted-foreground">—</p>
          )}
        </div>

        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Culture</Label>
          {company.culture ? (
            <div className="mt-1 text-sm bg-muted p-3 rounded max-h-[140px] overflow-y-auto whitespace-pre-wrap">
              {safeText(company.culture)}
            </div>
          ) : (
            <p className="mt-1 text-muted-foreground">—</p>
          )}
        </div>

        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Mission</Label>
          {company.mission ? (
            <div className="mt-1 text-sm bg-muted p-3 rounded max-h-[140px] overflow-y-auto whitespace-pre-wrap">
              {safeText(company.mission)}
            </div>
          ) : (
            <p className="mt-1 text-muted-foreground">—</p>
          )}
        </div>
      </div>

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
        ) : sources.length > 0 ? (
          <div className="mt-2 space-y-2">
            {sources.map((source) => (
              <div
                key={source.id}
                className="flex items-center justify-between p-2 bg-muted rounded text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Button
                    variant="link"
                    className="p-0 h-auto truncate"
                    onClick={() =>
                      openModal({
                        type: "jobSource",
                        sourceId: source.id,
                        source,
                      })
                    }
                  >
                    {safeText(source.name)}
                  </Button>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {safeText(source.sourceType)}
                  </Badge>
                </div>
                <Badge className={statusBadgeClass(source.status)}>{safeText(source.status)}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
            <Building2 className="h-3 w-3" />
            No job sources linked to this company
          </p>
        )}
      </div>

      <div className="pt-2 border-t">
        <Label className="text-muted-foreground text-xs uppercase tracking-wide flex items-center gap-1">
          <Briefcase className="h-3 w-3" />
          Recent Listings
        </Label>
        {listingsLoading ? (
          <div className="flex items-center gap-2 mt-2 text-muted-foreground text-sm">
            <Loader2 className="h-3 w-3 animate-spin" />
            Loading listings...
          </div>
        ) : recentListings.length > 0 ? (
          <div className="mt-2 space-y-2">
            {recentListings.map((listing) => (
              <div
                key={listing.id}
                className="flex items-center justify-between p-2 bg-muted rounded text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Button
                    variant="link"
                    className="p-0 h-auto truncate text-left"
                    onClick={() => openModal({ type: "jobListing", listing })}
                  >
                    {safeText(listing.title)}
                  </Button>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    {safeText(listing.status)}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground flex-shrink-0">
                  {safeText(listing.location, "—")}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-muted-foreground text-sm">No recent listings</p>
        )}
      </div>

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

      {actionError && <p className="text-sm text-destructive" role="alert">{actionError}</p>}

      {(handlers?.onDelete || handlers?.onReanalyze) && (
        <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t sticky bottom-0 bg-background py-3">
          {handlers?.onDelete && (
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
              className="w-full sm:w-auto"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </>
              )}
            </Button>
          )}

          {handlers?.onReanalyze && (
            <Button
              variant="outline"
              onClick={handleReanalyze}
              disabled={isReanalyzing}
              className="w-full sm:w-auto"
            >
              {isReanalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Re-analyzing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Re-analyze
                </>
              )}
            </Button>
          )}

          <Button variant="ghost" onClick={closeModal} className="w-full sm:w-auto">
            Close
          </Button>
        </div>
      )}

    </div>
  )
}
