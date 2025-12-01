import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
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
  const title = getJobTitle(item) || getScrapeTitle(item) || getDomain(item.url || "") || "Queue Item Details"
  const company = getCompanyName(item)
  const source = getSourceLabel(item)
  const stage = getStageLabel(item)

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
            className="text-blue-600 hover:underline break-all mt-1 inline-flex items-center gap-1 text-sm"
          >
            {item.url}
          </a>
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
