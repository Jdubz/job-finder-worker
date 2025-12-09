import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { ExternalLink, Link as LinkIcon, Loader2 } from "lucide-react"
import { useEntityModal } from "@/contexts/EntityModalContext"
import { jobListingsClient, jobMatchesClient, companiesClient, jobSourcesClient } from "@/api"
import {
  getCompanyName,
  getDomain,
  getJobTitle,
  getScrapeTitle,
  getSourceLabel,
  getStageLabel,
  getTaskTypeLabel,
} from "@/pages/queue-management/components/queueItemDisplay"
import type { QueueItem } from "@shared/types"

interface QueueItemModalContentProps {
  item: QueueItem
  handlers?: {
    onCancel?: (item: QueueItem) => void | Promise<void>
  }
}

export function QueueItemModalContent({ item, handlers }: QueueItemModalContentProps) {
  const { toast } = useToast()
  const { openModal } = useEntityModal()
  const [loadingKey, setLoadingKey] = useState<string | null>(null)

  const title = getJobTitle(item) || getScrapeTitle(item) || getDomain(item.url || "") || "Queue Item Details"
  const company = getCompanyName(item)
  const source = getSourceLabel(item)
  const stage = getStageLabel(item)

  const metadata = (item.metadata ?? {}) as Record<string, unknown>
  const output = (item.output ?? {}) as Record<string, unknown>
  const scraped = (item.scraped_data ?? output.scraped_data ?? {}) as Record<string, unknown>
  const pipeline = (item.pipeline_state ?? output.pipeline_state ?? {}) as Record<string, unknown>

  const getStringField = (obj: Record<string, unknown>, key: string): string | undefined => {
    const value = obj?.[key]
    return typeof value === "string" && value.trim().length > 0 ? value : undefined
  }

  const jobListingId =
    getStringField(metadata, "job_listing_id") || getStringField(scraped, "job_listing_id") || getStringField(pipeline, "job_listing_id")

  const companyId =
    item.company_id ||
    getStringField(metadata, "company_id") ||
    getStringField(scraped, "company_id") ||
    getStringField(pipeline, "company_id")

  const sourceId =
    item.source_id ||
    getStringField(metadata, "source_id") ||
    getStringField(scraped, "source_id") ||
    getStringField(pipeline, "source_id")

  const openListingModal = async () => {
    if (!jobListingId) return
    setLoadingKey("listing")
    try {
      const listing = await jobListingsClient.getListing(jobListingId)
      openModal({ type: "jobListing", listing })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Unable to open job listing",
        description: error instanceof Error ? error.message : "Please try again."
      })
    } finally {
      setLoadingKey(null)
    }
  }

  const openMatchModal = async () => {
    if (!jobListingId) return
    setLoadingKey("match")
    try {
      const matches = await jobMatchesClient.listMatches({ jobListingId, limit: 1 })
      const match = matches[0]
      if (!match) {
        toast({ variant: "info", title: "No job match yet", description: "This listing has not produced a match." })
        return
      }
      openModal({ type: "jobMatch", match })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Unable to open job match",
        description: error instanceof Error ? error.message : "Please try again."
      })
    } finally {
      setLoadingKey(null)
    }
  }

  const openCompanyModal = async () => {
    if (!companyId) return
    setLoadingKey("company")
    try {
      const companyRecord = await companiesClient.getCompany(companyId)
      openModal({ type: "company", companyId, company: companyRecord })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Unable to open company",
        description: error instanceof Error ? error.message : "Please try again."
      })
    } finally {
      setLoadingKey(null)
    }
  }

  const openSourceModal = async () => {
    if (!sourceId) return
    setLoadingKey("source")
    try {
      const sourceRecord = await jobSourcesClient.getJobSource(sourceId)
      openModal({ type: "jobSource", sourceId, source: sourceRecord })
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Unable to open source",
        description: error instanceof Error ? error.message : "Please try again."
      })
    } finally {
      setLoadingKey(null)
    }
  }

  return (
    <div className="space-y-4 overflow-y-auto flex-1 pr-2" data-testid="queue-item-dialog">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-lg font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">
            {(company || getDomain(item.url || "") || "No company") as string} • {getTaskTypeLabel(item)}
          </p>
        </div>
        <Badge variant="outline" className="capitalize">
          {item.status}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">ID</Label>
          <p className="mt-1 text-sm font-mono text-muted-foreground break-all">{item.id || "—"}</p>
        </div>
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Stage</Label>
          <p className="mt-1">{stage || "—"}</p>
        </div>
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Source</Label>
          <p className="mt-1">{source || "—"}</p>
        </div>
      </div>

      {item.url && (
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">URL</Label>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline break-all mt-1 inline-flex items-center gap-1 text-sm"
          >
            {item.url}
          </a>
        </div>
      )}

      {(jobListingId || companyId || sourceId) && (
        <div className="space-y-3">
          <Label className="text-muted-foreground text-xs uppercase tracking-wide flex items-center gap-1">
            <LinkIcon className="h-3 w-3" /> Related records
          </Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {jobListingId && (
              <div className="space-y-1">
                <div className="text-xs font-mono text-muted-foreground break-all">Listing: {jobListingId}</div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={openListingModal} disabled={loadingKey === "listing"}>
                    {loadingKey === "listing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Open listing modal
                  </Button>
                  <Button size="sm" variant="ghost" onClick={openMatchModal} disabled={loadingKey === "match"}>
                    {loadingKey === "match" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                    View job match
                  </Button>
                </div>
              </div>
            )}

            {companyId && (
              <div className="space-y-1">
                <div className="text-xs font-mono text-muted-foreground break-all">Company: {companyId}</div>
                <Button size="sm" variant="secondary" onClick={openCompanyModal} disabled={loadingKey === "company"}>
                  {loadingKey === "company" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Open company modal
                </Button>
              </div>
            )}

            {sourceId && (
              <div className="space-y-1">
                <div className="text-xs font-mono text-muted-foreground break-all">Source: {sourceId}</div>
                <Button size="sm" variant="secondary" onClick={openSourceModal} disabled={loadingKey === "source"}>
                  {loadingKey === "source" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Open source modal
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {item.error_details && (
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Error</Label>
          <p className="mt-1 text-sm text-destructive whitespace-pre-wrap">{item.error_details}</p>
        </div>
      )}

      {item.metadata && (
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Metadata</Label>
          <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap break-all">
            {JSON.stringify(item.metadata, null, 2)}
          </pre>
        </div>
      )}

      {item.output && (
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Output</Label>
          <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-48 whitespace-pre-wrap break-all">
            {JSON.stringify(item.output, null, 2)}
          </pre>
        </div>
      )}

      {handlers?.onCancel && (
        <div className="pt-2 border-t">
          <Button variant="destructive" onClick={() => handlers.onCancel?.(item)}>
            Cancel Item
          </Button>
        </div>
      )}
    </div>
  )
}
