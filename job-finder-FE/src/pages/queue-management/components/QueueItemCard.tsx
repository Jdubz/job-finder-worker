import type { QueueItem } from "@shared/types"
import { Card, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Clock,
  Zap,
  CheckCircle2,
  XCircle,
  Pause,
  Filter,
  AlertCircle,
  Trash2,
  ExternalLink,
  Calendar,
} from "lucide-react"
import { format } from "date-fns"

interface QueueItemCardProps {
  item: QueueItem
  selected: boolean
  onSelect: (id: string, selected: boolean) => void
  onCancel: (id: string) => void
}

export function QueueItemCard({ item, selected, onSelect, onCancel }: QueueItemCardProps) {
  if (!item.id) {
    return null
  }

  // TypeScript type narrowing - at this point we know item.id is defined
  const itemId = item.id

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />
      case "processing":
        return <Zap className="h-4 w-4 text-blue-500 animate-pulse" />
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />
      case "skipped":
        return <Pause className="h-4 w-4 text-gray-500" />
      case "filtered":
        return <Filter className="h-4 w-4 text-purple-500" />
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />
    }
  }

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "pending":
        return "secondary"
      case "processing":
        return "default"
      case "success":
        return "default"
      case "failed":
        return "destructive"
      case "skipped":
        return "outline"
      case "filtered":
        return "outline"
      default:
        return "outline"
    }
  }

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

  const getStatusBorderClass = () => {
    switch (item.status) {
      case "processing":
        return "border-l-4 border-l-blue-500"
      case "success":
        return "border-l-4 border-l-green-500 bg-green-50/30 dark:bg-green-950/10"
      case "failed":
        return "border-l-4 border-l-red-500"
      default:
        return ""
    }
  }

  return (
    <Card
      data-testid={`queue-item-${itemId}`}
      className={`transition-all duration-300 ease-in-out hover:shadow-md ${selected ? "ring-2 ring-primary shadow-lg" : ""} ${getStatusBorderClass()}`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            aria-label={`Select job at ${item.company_name}`}
            onChange={(e) => onSelect(itemId, e.target.checked)}
            className="mt-1 rounded border-gray-300"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              {getStatusIcon(item.status)}
              <Badge
                variant={
                  getStatusBadgeVariant(item.status) as
                    | "default"
                    | "secondary"
                    | "destructive"
                    | "outline"
                }
              >
                {item.status}
              </Badge>
              <Badge variant="outline">{item.type}</Badge>
              {item.source && (
                <Badge variant="outline" className="text-xs">
                  {item.source}
                </Badge>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-primary hover:underline truncate"
                >
                  {item.url}
                </a>
              </div>

              {item.company_name && (
                <div className="text-sm text-muted-foreground">
                  <strong>Company:</strong> {item.company_name}
                </div>
              )}

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>Created: {formatDate(item.created_at)}</span>
                </div>
                {item.updated_at && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>Updated: {formatDate(item.updated_at)}</span>
                  </div>
                )}
              </div>

              {item.result_message && (
                <div className="mt-2 p-2 bg-muted rounded-md">
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Result Message:
                  </div>
                  <div className="text-sm text-foreground">{item.result_message}</div>
                </div>
              )}

            </div>
          </div>

          <div className="flex gap-1">
            {canCancel && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onCancel(itemId)}
                className="h-8 px-2"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}
