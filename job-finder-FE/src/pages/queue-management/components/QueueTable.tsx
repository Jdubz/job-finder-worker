import type { QueueItem } from "@shared/types"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Trash2 } from "lucide-react"
import {
  getCompanyName,
  getDomain,
  getJobTitle,
  getScrapeTitle,
  getSourceLabel,
  getStageLabel,
  getTaskTypeLabel,
} from "./queueItemDisplay"

type QueueStatusTone = "pending" | "processing" | "success" | "failed" | "skipped" | "filtered"

function statusTone(status: string): string {
  const tones: Record<QueueStatusTone, string> = {
    pending: "bg-amber-100 text-amber-900 border border-amber-200",
    processing: "bg-blue-100 text-blue-900 border border-blue-200",
    success: "bg-emerald-100 text-emerald-900 border border-emerald-200",
    failed: "bg-rose-100 text-rose-900 border border-rose-200",
    skipped: "bg-slate-100 text-slate-900 border border-slate-200",
    filtered: "bg-orange-100 text-orange-900 border border-orange-200",
  }
  return tones[status as QueueStatusTone] ?? "bg-muted text-foreground"
}

export interface QueueTableProps {
  items: QueueItem[]
  onRowClick: (item: QueueItem) => void
  onCancel: (id: string) => void
  formatRelativeTime: (date: unknown) => string
}

export function QueueTable({ items, onRowClick, onCancel, formatRelativeTime }: QueueTableProps) {
  return (
    <Table className="rounded-lg border border-border/70 bg-card/60 shadow-sm">
      <TableHeader className="bg-muted/40">
        <TableRow className="hover:bg-muted/40">
          <TableHead>Task</TableHead>
          <TableHead className="hidden md:table-cell">Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="hidden md:table-cell">Updated</TableHead>
          <TableHead className="hidden md:table-cell">Result</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          if (!item.id) return null
          const title =
            getJobTitle(item) || getScrapeTitle(item) || getDomain(item.url) || "Untitled task"
          const company = getCompanyName(item)
          const source = getSourceLabel(item)
          const typeLabel = getTaskTypeLabel(item)
          const stageLabel = getStageLabel(item)
          const canCancel = item.status === "pending" || item.status === "processing"

          return (
            <TableRow
              key={item.id}
              data-testid={`queue-item-${item.id}`}
              className="cursor-pointer even:bg-muted/30 odd:bg-card hover:bg-primary/5"
              onClick={() => onRowClick(item)}
            >
              <TableCell className="font-medium max-w-[220px]">
                <div className="flex flex-col gap-1">
                  <span className="truncate">{title}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {company || source || getDomain(item.url) || "No details yet"}
                  </span>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant="outline">{typeLabel}</Badge>
                  {stageLabel && <Badge variant="secondary">{stageLabel}</Badge>}
                  {source && <Badge variant="outline">{source}</Badge>}
                </div>
              </TableCell>
              <TableCell>
                <Badge className={statusTone(item.status)}>{item.status}</Badge>
              </TableCell>
              <TableCell className="hidden md:table-cell text-muted-foreground">
                {formatRelativeTime(item.updated_at)}
              </TableCell>
              <TableCell className="hidden md:table-cell max-w-[240px] truncate text-muted-foreground">
                {item.result_message ?? "—"}
              </TableCell>
              <TableCell className="text-right">
                {canCancel && item.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      onCancel(item.id as string)
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
