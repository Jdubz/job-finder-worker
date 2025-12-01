import { useMemo } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { ExternalLink, Pause, Play, Trash2 } from "lucide-react"
import type { JobSource, JobSourceStatus } from "@shared/types"

const statusColors: Record<JobSourceStatus, string> = {
  active: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  disabled: "bg-gray-100 text-gray-800",
  error: "bg-red-100 text-red-800",
}

const sourceTypeLabels: Record<string, string> = {
  api: "API",
  rss: "RSS",
  html: "HTML",
  greenhouse: "Greenhouse",
  workday: "Workday",
  lever: "Lever",
}

function formatDate(date: unknown): string {
  if (!date) return "—"
  let d: Date
  if (date instanceof Date) {
    d = date
  } else if (typeof date === "string" || typeof date === "number") {
    d = new Date(date)
  } else if (
    typeof date === "object" &&
    date !== null &&
    "toDate" in date &&
    typeof (date as { toDate: () => Date }).toDate === "function"
  ) {
    d = (date as { toDate: () => Date }).toDate()
  } else {
    return "—"
  }
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatRelativeTime(date: unknown): string {
  if (!date) return "—"
  let d: Date
  if (date instanceof Date) {
    d = date
  } else if (typeof date === "string" || typeof date === "number") {
    d = new Date(date)
  } else {
    return "—"
  }
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return "just now"
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

const getSourceUrl = (source: JobSource): string | null => {
  if (typeof source.configJson === "object" && source.configJson !== null) {
    const config = source.configJson as Record<string, unknown>
    if (typeof config.url === "string") return config.url
  }
  return null
}

interface JobSourceModalContentProps {
  source: JobSource
  handlers?: {
    onToggleStatus?: (source: JobSource) => void | Promise<void>
    onDelete?: (id: string) => void | Promise<void>
  }
}

export function JobSourceModalContent({ source, handlers }: JobSourceModalContentProps) {
  const url = useMemo(() => getSourceUrl(source), [source])

  return (
    <div className="space-y-4 overflow-y-auto flex-1 pr-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xl font-semibold leading-tight">{source.name}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {source.aggregatorDomain
              ? `Aggregator: ${source.aggregatorDomain}`
              : source.companyId
                ? "Company-specific source"
                : "No company associated"}
          </p>
        </div>
        <Badge className={statusColors[source.status]}>{source.status}</Badge>
      </div>

      <div>
        <Label className="text-muted-foreground text-xs uppercase tracking-wide">ID</Label>
        <p className="mt-1 text-sm font-mono text-muted-foreground break-all">{source.id || "—"}</p>
      </div>

      <div>
        <Label className="text-muted-foreground text-xs uppercase tracking-wide">Source URL</Label>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start text-blue-600 hover:underline mt-1 break-all text-sm"
          >
            <span className="flex-1">{url}</span>
            <ExternalLink className="ml-1 h-3 w-3 flex-shrink-0 mt-1" />
          </a>
        ) : (
          <p className="mt-1 text-muted-foreground">—</p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Type</Label>
          <p className="mt-1">{sourceTypeLabels[source.sourceType] || source.sourceType}</p>
        </div>
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Company ID</Label>
          <p className="mt-1 text-sm font-mono text-muted-foreground">{source.companyId || "—"}</p>
        </div>
      </div>

      <div>
        <Label className="text-muted-foreground text-xs uppercase tracking-wide">Aggregator Domain</Label>
        <p className="mt-1">{source.aggregatorDomain || "—"}</p>
      </div>

      <div>
        <Label className="text-muted-foreground text-xs uppercase tracking-wide">Tags</Label>
        {source.tags && source.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1 mt-1">
            {source.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-muted-foreground">—</p>
        )}
      </div>

      <div>
        <Label className="text-muted-foreground text-xs uppercase tracking-wide">Config</Label>
        <pre className="mt-1 text-xs bg-muted p-2 rounded overflow-auto max-h-[160px] break-all whitespace-pre-wrap">
          {JSON.stringify(source.configJson, null, 2)}
        </pre>
      </div>

      <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t">
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Last Scraped</Label>
          <p className="mt-1">{formatRelativeTime(source.lastScrapedAt)}</p>
        </div>
        <div>
          <Label className="text-muted-foreground text-xs uppercase tracking-wide">Updated</Label>
          <p className="mt-1 text-sm text-muted-foreground">{formatDate(source.updatedAt)}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
        {handlers?.onToggleStatus && (
          <Button variant="outline" onClick={() => handlers.onToggleStatus?.(source)} className="w-full sm:w-auto">
            {source.status === "active" ? (
              <>
                <Pause className="mr-2 h-4 w-4" />
                Pause
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Activate
              </>
            )}
          </Button>
        )}
        {handlers?.onDelete && (
          <Button variant="destructive" onClick={() => source.id && handlers.onDelete?.(source.id)} className="w-full sm:w-auto">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        )}
      </div>
    </div>
  )
}
