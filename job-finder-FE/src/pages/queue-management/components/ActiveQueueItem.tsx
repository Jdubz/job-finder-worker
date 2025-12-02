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
  item?: QueueItem | null
  loading?: boolean
  onCancel: (id: string) => void
}

export function ActiveQueueItem({ item, loading, onCancel }: ActiveQueueItemProps) {
  const containerClasses =
    "min-h-[168px] flex items-stretch border border-emerald-200 bg-emerald-50 shadow-md ring-1 ring-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-900/60 dark:ring-emerald-900/40"

  if (loading) {
    return (
      <Card className={containerClasses}>
        <CardContent className="flex items-center gap-3 p-5 text-sm text-emerald-800 dark:text-emerald-100">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-100">
            <Activity className="h-4 w-4 animate-pulse" />
          </span>
          Fetching live queue…
        </CardContent>
      </Card>
    )
  }

  if (!item) {
    return (
      <Card className={`${containerClasses} border-dashed`}>
        <CardContent className="flex items-center gap-3 p-5 text-sm text-emerald-700 dark:text-emerald-200">
          <Pause className="h-4 w-4" />
          Nothing processing right now. New work will appear here when a worker picks it up.
        </CardContent>
      </Card>
    )
  }

  const title = getJobTitle(item)
  const company = getCompanyName(item)
  const stage = getStageLabel(item)
  const domain = getDomain(item.url || "")
  const source = getSourceLabel(item)
  const taskType = getTaskTypeLabel(item)
  const distinctStage = stage && stage.toLowerCase() !== taskType.toLowerCase() && (!source || stage.toLowerCase() !== source.toLowerCase())

  return (
    <Card className={containerClasses}>
      <CardContent className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shadow-inner dark:bg-emerald-900/60 dark:text-emerald-100">
              <Activity className="h-5 w-5 animate-pulse" />
            </div>
            <div className="space-y-3 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge className="bg-emerald-600 text-white shadow-sm">Processing</Badge>
                <Badge variant="outline" className="border-emerald-200 text-emerald-800 dark:border-emerald-800 dark:text-emerald-100">
                  {taskType}
                </Badge>
                {distinctStage && <Badge variant="secondary" className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100">{stage}</Badge>}
                {source && <Badge variant="outline" className="border-slate-200 text-slate-700 dark:border-slate-800 dark:text-slate-100">{source}</Badge>}
              </div>

              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-sm font-semibold truncate text-emerald-900 dark:text-emerald-50">
                  {title || "Role not yet detected"}
                </span>
                {company && (
                  <span className="text-sm text-emerald-700 dark:text-emerald-200 flex items-center gap-1">
                    <span aria-hidden="true">•</span>
                    <span>{company}</span>
                    <span className="sr-only">{company}</span>
                  </span>
                )}
              </div>

              <div className="grid gap-3 text-xs text-emerald-700 dark:text-emerald-200 sm:grid-cols-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ExternalLink className="h-3 w-3 flex-shrink-0 text-emerald-600 dark:text-emerald-200" />
                  <a
                    href={item.url || undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-emerald-700 font-medium hover:underline dark:text-emerald-100"
                  >
                    {domain ?? item.url}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3 text-emerald-600 dark:text-emerald-200" />
                  <span>
                    In flight {formatDistanceToNow((item.processed_at ?? item.updated_at) as Date)}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-emerald-600 dark:text-emerald-300">
                Updated {format((item.updated_at ?? item.created_at) as Date, "MMM d, h:mm a")}
              </div>

              {item.result_message && (
                <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs text-emerald-800 shadow-sm dark:border-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-100">
                  <AlertCircle className="h-3 w-3 text-emerald-600 dark:text-emerald-200" />
                  <span className="truncate leading-relaxed">{item.result_message}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Badge variant="outline" className="text-[11px] border-emerald-200 text-emerald-800 dark:border-emerald-800 dark:text-emerald-100">
              Started {formatDistanceToNow((item.processed_at ?? item.created_at) as Date, { addSuffix: true })}
            </Badge>
            {(item.status === "processing" || item.status === "pending") && item.id && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => item.id && onCancel(item.id)}
                className="h-8 px-2 border-emerald-200 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-100 dark:hover:bg-emerald-900/40"
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
