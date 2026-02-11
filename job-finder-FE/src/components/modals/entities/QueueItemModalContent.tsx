import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useToast } from "@/components/ui/use-toast"
import { statusBadgeClass } from "@/lib/status-badge"
import { AlertTriangle, Check, Copy, ExternalLink, Link as LinkIcon, Loader2 } from "lucide-react"
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
    const value = obj[key]
    return typeof value === "string" && value.trim().length > 0 ? value : undefined
  }

  const findIdInObjects = (key: string): string | undefined =>
    getStringField(metadata, key) || getStringField(scraped, key) || getStringField(pipeline, key)

  const jobListingId = findIdInObjects("job_listing_id")
  const companyId = item.company_id || findIdInObjects("company_id")
  const sourceId = item.source_id || findIdInObjects("source_id")

  const createModalOpener = <T,>(
    key: string,
    id: string | undefined,
    fetcher: () => Promise<T>,
    onSuccess: (data: T) => void,
    errorTitle: string
  ) => {
    return async () => {
      if (!id) return
      setLoadingKey(key)
      try {
        const data = await fetcher()
        onSuccess(data)
      } catch (error) {
        toast({
          variant: "destructive",
          title: errorTitle,
          description: error instanceof Error ? error.message : "Please try again."
        })
      } finally {
        setLoadingKey(null)
      }
    }
  }

  const openListingModal = createModalOpener(
    "listing",
    jobListingId,
    () => jobListingsClient.getListing(jobListingId as string),
    (listing) => openModal({ type: "jobListing", listing }),
    "Unable to open job listing"
  )

  const openMatchModal = createModalOpener(
    "match",
    jobListingId,
    () => jobMatchesClient.listMatches({ jobListingId: jobListingId as string, limit: 1 }),
    (matches) => {
      const match = matches[0] as (typeof matches)[number] | undefined
      if (!match) {
        toast({ variant: "info", title: "No job match yet", description: "This listing has not produced a match." })
        return
      }
      openModal({ type: "jobMatch", match })
    },
    "Unable to open job match"
  )

  const openCompanyModal = createModalOpener(
    "company",
    companyId,
    () => companiesClient.getCompany(companyId as string),
    (companyRecord) => openModal({ type: "company", companyId, company: companyRecord }),
    "Unable to open company"
  )

  const openSourceModal = createModalOpener(
    "source",
    sourceId,
    () => jobSourcesClient.getJobSource(sourceId as string),
    (sourceRecord) => openModal({ type: "jobSource", sourceId, source: sourceRecord }),
    "Unable to open source"
  )

  return (
    <div className="space-y-4 overflow-y-auto flex-1 pr-2" data-testid="queue-item-dialog">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-lg font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground">
            {(company || getDomain(item.url || "") || "No company") as string} • {getTaskTypeLabel(item)}
          </p>
        </div>
        <Badge className={statusBadgeClass(item.status)}>
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
                    {loadingKey === "listing" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
                    Open listing modal
                  </Button>
                  <Button size="sm" variant="ghost" onClick={openMatchModal} disabled={loadingKey === "match"}>
                    {loadingKey === "match" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <LinkIcon className="mr-2 h-4 w-4" />}
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

      {(item.result_message || item.error_details) && (
        <ErrorResultSection resultMessage={item.result_message} errorDetails={item.error_details} status={item.status} />
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

function ErrorResultSection({
  resultMessage,
  errorDetails,
  status,
}: {
  resultMessage?: string | null
  errorDetails?: string | null
  status?: string
}) {
  const [copied, setCopied] = useState(false)
  const isFailed = status === "failed" || status === "blocked"
  const text = [resultMessage, errorDetails].filter(Boolean).join("\n\n")

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground text-xs uppercase tracking-wide flex items-center gap-1">
          {isFailed && <AlertTriangle className="h-3 w-3 text-destructive" />}
          {isFailed ? "Error" : "Result"}
        </Label>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={handleCopy}
        >
          {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <div
        className={`mt-1 text-sm whitespace-pre-wrap rounded-md p-3 ${
          isFailed
            ? "bg-destructive/10 text-destructive border border-destructive/20"
            : "bg-muted text-foreground"
        }`}
      >
        {resultMessage && <p>{resultMessage}</p>}
        {errorDetails && (
          <p className={resultMessage ? "mt-2 text-xs opacity-80" : ""}>{errorDetails}</p>
        )}
      </div>
    </div>
  )
}
