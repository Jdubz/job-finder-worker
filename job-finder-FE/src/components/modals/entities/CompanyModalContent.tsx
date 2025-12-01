import { useCompany } from "@/hooks/useCompany"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { ExternalLink, Loader2 } from "lucide-react"
import type { Company } from "@shared/types"

const safeText = (value: unknown, fallback = "—") => {
  if (value === null || value === undefined || value === "") return fallback
  if (typeof value === "string" || typeof value === "number") return value
  try {
    return JSON.stringify(value)
  } catch {
    return fallback
  }
}

const DATA_QUALITY_THRESHOLDS = {
  COMPLETE: { ABOUT: 100, CULTURE: 50 },
  PARTIAL: { ABOUT: 50, CULTURE: 25 },
} as const

function getDataStatus(company: Company): { label: string; color: string } {
  const aboutLength = (company.about || "").length
  const cultureLength = (company.culture || "").length

  if (
    aboutLength > DATA_QUALITY_THRESHOLDS.COMPLETE.ABOUT &&
    cultureLength > DATA_QUALITY_THRESHOLDS.COMPLETE.CULTURE
  ) {
    return { label: "Complete", color: "bg-green-100 text-green-800" }
  }
  if (
    aboutLength > DATA_QUALITY_THRESHOLDS.PARTIAL.ABOUT ||
    cultureLength > DATA_QUALITY_THRESHOLDS.PARTIAL.CULTURE
  ) {
    return { label: "Partial", color: "bg-yellow-100 text-yellow-800" }
  }
  return { label: "Pending", color: "bg-gray-100 text-gray-800" }
}

export function CompanyDetailsModalContent({
  companyId,
  company: providedCompany,
}: {
  companyId?: string | null
  company?: Company | null
}) {
  const { company: fetchedCompany, loading, error } = useCompany(
    providedCompany ? null : companyId,
    { autoFetch: !providedCompany }
  )

  const company = providedCompany || fetchedCompany

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

  const status = getDataStatus(company)

  return (
    <div className="space-y-4 overflow-y-auto flex-1 pr-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-lg font-semibold leading-tight">{safeText(company.name)}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {safeText(company.industry, "Industry not specified")}
          </p>
        </div>
        <Badge className={status.color}>{status.label}</Badge>
      </div>

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

    </div>
  )
}
