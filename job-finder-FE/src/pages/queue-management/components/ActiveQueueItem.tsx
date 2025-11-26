import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { QueueItem } from "@shared/types"
import { Activity, AlertCircle, Clock, ExternalLink, Pause, Trash2 } from "lucide-react"
import { format, formatDistanceToNow } from "date-fns"
import {
  getCompanyName,
  getDomain,
  getJobTitle,
  getSourceLabel,
  getStageLabel,
  getTaskTypeLabel,
} from "./queueItemDisplay"

interface ActiveQueueItemProps {
  item?: QueueItem
  loading?: boolean
  onCancel: (id: string) => void
}

export function ActiveQueueItem({ item, loading, onCancel }: ActiveQueueItemProps) {
  if (loading) {
    return (
      <Card className="border-blue-200 bg-blue-50/60">
        <CardContent className="flex items-center gap-3 p-4 text-sm text-blue-700">
          <Activity className="h-4 w-4 animate-pulse" />
          Fetching live queue…
        </CardContent>
      </Card>
    )
  }

  if (!item) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
          <Pause className="h-4 w-4" />
          Nothing processing right now. New work will appear here when a worker picks it up.
        </CardContent>
      </Card>
    )
  }

  const title = getJobTitle(item)
  const company = getCompanyName(item)
  const stage = getStageLabel(item)
  const domain = getDomain(item.url)
  const source = getSourceLabel(item)
  const taskType = getTaskTypeLabel(item)

  return (
    <Card className="border-blue-200 bg-blue-50/60 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5">
              <Activity className="h-5 w-5 text-blue-600 animate-pulse" />
            </div>
            <div className="space-y-2 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge className="bg-blue-600 text-white hover:bg-blue-600">Processing</Badge>
                <Badge variant="outline">{taskType}</Badge>
                {stage && <Badge variant="secondary">{stage}</Badge>}
                {source && <Badge variant="outline">{source}</Badge>}
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

              {company && (
                <div className="text-xs text-muted-foreground">Company: {company}</div>
              )}

              <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  <a
                    href={item.url}
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
                    In flight {formatDistanceToNow((item.processed_at ?? item.updated_at) as Date)}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground">
                Updated {format((item.updated_at ?? item.created_at) as Date, "MMM d, h:mm a")}
              </div>

              {item.result_message && (
                <div className="flex items-start gap-2 rounded-md bg-white/60 px-3 py-2 text-xs text-foreground">
                  <AlertCircle className="h-3 w-3 text-blue-500" />
                  <span className="truncate">{item.result_message}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Badge variant="outline" className="text-[11px]">
              Started {formatDistanceToNow((item.processed_at ?? item.created_at) as Date, { addSuffix: true })}
            </Badge>
            {(item.status === "processing" || item.status === "pending") && item.id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => item.id && onCancel(item.id)}
                className="h-8 px-2"
              >
                <Trash2 className="h-3 w-3" />
                <span className="ml-2">Cancel</span>
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
