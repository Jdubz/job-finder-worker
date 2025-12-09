import type { QueueItem } from "@shared/types"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { statusBadgeClass } from "@/lib/status-badge"
import { Calendar, Clock, ExternalLink, RotateCcw, Trash2 } from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import {
  getCompanyName,
  getDomain,
  getJobTitle,
  getSourceLabel,
  getStageLabel,
  getTaskTypeLabel,
} from "./queueItemDisplay"

interface QueueItemCardProps {
  item: QueueItem
  selected: boolean
  onSelect: (id: string, selected: boolean) => void
  onCancel: (id: string) => void
  onRetry: (id: string) => void
}

export function QueueItemCard({ item, selected, onSelect, onCancel, onRetry }: QueueItemCardProps) {
  if (!item.id) {
    return null
  }

  // TypeScript type narrowing - at this point we know item.id is defined
  const itemId = item.id

  const formatDate = (date: unknown) => {
    if (!date) return "N/A"

    if (date && typeof date === "object" && "toDate" in date) {
      return format((date as { toDate: () => Date }).toDate(), "MMM d, yyyy 'at' h:mm a")
    }

    if (date instanceof Date) {
      return format(date, "MMM d, yyyy 'at' h:mm a")
    }

    if (typeof date === "string" || typeof date === "number") {
      return new Date(date).toLocaleString()
    }

    return "N/A"
  }

  const canCancel = item.status === "pending" || item.status === "processing"

  const title = getJobTitle(item)
  const company = getCompanyName(item)
  const stageLabel = getStageLabel(item)
  const domain = getDomain(item.url || "")
  const sourceLabel = getSourceLabel(item)
  const taskType = getTaskTypeLabel(item)
  const distinctStage =
    stageLabel && stageLabel.toLowerCase() !== taskType.toLowerCase() &&
    (!sourceLabel || stageLabel.toLowerCase() !== sourceLabel.toLowerCase())

  return (
    <Card
      data-testid={`queue-item-${itemId}`}
      className={`transition-all duration-200 hover:shadow-sm ${selected ? "ring-2 ring-primary shadow-md" : ""}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Select job at ${item.company_name}`}
            onChange={(e) => onSelect(itemId, e.target.checked)}
            className="mt-1 rounded border-gray-300"
          />

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge className={statusBadgeClass(item.status)}>{item.status}</Badge>
              <Badge variant="outline">{taskType}</Badge>
              {distinctStage && (
                <Badge variant="secondary" className="capitalize">
                  {stageLabel}
                </Badge>
              )}
              {sourceLabel && <Badge variant="outline">{sourceLabel}</Badge>}
              {item.source_tier && <Badge variant="outline">Tier {item.source_tier}</Badge>}
            </div>

            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-semibold truncate">
                {title || "Role not yet detected"}
              </span>
              {company && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <span aria-hidden="true">•</span>
                  <span>{company}</span>
                  <span className="sr-only">{company}</span>
                </span>
              )}
            </div>

            <div className="grid gap-3 text-xs text-muted-foreground md:grid-cols-3">
              <div className="flex items-center gap-2 min-w-0">
                <ExternalLink className="h-3 w-3 flex-shrink-0" />
                <a
                  href={item.url || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate text-primary hover:underline"
                >
                  {domain ?? item.url}
                </a>
              </div>

              <div className="flex items-center gap-2">
                <Clock className="h-3 w-3" />
                <span>
                  Queued {formatDistanceToNow(item.created_at as Date, { addSuffix: true })}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Calendar className="h-3 w-3" />
                <span>Updated {formatDate(item.updated_at)}</span>
              </div>
            </div>

            {item.result_message && (
              <div className="rounded-md bg-muted px-3 py-2 text-xs text-foreground">
                {item.result_message}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-1">
              {item.status === "failed" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRetry(itemId)}
                  className="h-8 px-2"
                  title="Retry this task"
                >
                  <RotateCcw className="h-3 w-3" />
                </Button>
              )}
              {canCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onCancel(itemId)}
                  className="h-8 px-2"
                  title="Cancel this task"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {item.processed_at
                ? `In flight ${formatDistanceToNow(item.processed_at as Date)}`
                : `Added ${formatDistanceToNow(item.created_at as Date)} ago`}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
