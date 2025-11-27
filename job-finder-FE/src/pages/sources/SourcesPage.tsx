import { useState, useMemo } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useQueueItems } from "@/hooks/useQueueItems"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AlertCircle, CheckCircle2, Loader2, Plus, Rss, Clock, ExternalLink } from "lucide-react"
import type { QueueItem, QueueStatus } from "@shared/types"

function formatRelativeTime(date: unknown): string {
  if (!date) return "—"
  let d: Date
  if (date instanceof Date) {
    d = date
  } else if (typeof date === "string" || typeof date === "number") {
    d = new Date(date)
  } else if (typeof date === "object" && date !== null && "toDate" in date && typeof (date as { toDate: () => Date }).toDate === "function") {
    d = (date as { toDate: () => Date }).toDate()
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

const statusVariants: Record<QueueStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  processing: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  skipped: "bg-gray-100 text-gray-800",
  filtered: "bg-orange-100 text-orange-800",
}

export function SourcesPage() {
  const { user } = useAuth()
  const { queueItems, loading, submitSourceDiscovery } = useQueueItems()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Form state
  const [sourceUrl, setSourceUrl] = useState("")
  const [companyName, setCompanyName] = useState("")

  // Filter to only show source discovery tasks
  const sourceTasks = useMemo(
    () => queueItems.filter((item) => item.type === "source_discovery"),
    [queueItems]
  )

  const resetForm = () => {
    setSourceUrl("")
    setCompanyName("")
    setError(null)
    setSuccess(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    if (!sourceUrl.trim()) {
      setError("Source URL is required")
      return
    }

    try {
      setIsSubmitting(true)
      await submitSourceDiscovery({
        url: sourceUrl.trim(),
        companyName: companyName.trim() || undefined,
      })

      setSuccess("Source discovery task created!")
      setTimeout(() => {
        resetForm()
        setIsModalOpen(false)
      }, 1500)
    } catch (err) {
      console.error("Failed to submit source:", err)
      setError(err instanceof Error ? err.message : "Failed to submit. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!user) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sources</h1>
          <p className="text-muted-foreground mt-2">
            Discover job sources and feeds (sign in required)
          </p>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Sign in to discover sources.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Sources</h1>
          <p className="text-muted-foreground mt-2">
            Discover and configure job sources for automated scraping
          </p>
        </div>
        <Dialog
          open={isModalOpen}
          onOpenChange={(open) => {
            setIsModalOpen(open)
            if (!open) resetForm()
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Source
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Discover Source</DialogTitle>
              <DialogDescription>
                Enter a job board, careers page, or RSS feed URL to auto-configure scraping
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sourceUrl">
                  Source URL <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sourceUrl"
                  type="url"
                  placeholder="https://company.com/careers or https://boards.greenhouse.io/company"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  disabled={isSubmitting}
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Job board, careers page, API endpoint, or RSS feed URL
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="companyName">Company Name (Optional)</Label>
                <Input
                  id="companyName"
                  type="text"
                  placeholder="Acme Corporation"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={isSubmitting}
                />
                <p className="text-sm text-muted-foreground">
                  Leave blank to auto-detect from the source
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {success && (
                <Alert className="border-green-500 bg-green-50 text-green-900">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Discover Source"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Source Tasks List */}
      <Card>
        <CardHeader>
          <CardTitle>Source Discovery Tasks</CardTitle>
          <CardDescription>Track source configuration and validation</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : sourceTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Rss className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No source discovery tasks yet.</p>
              <p className="text-sm">Click "Add Source" to get started.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source URL</TableHead>
                  <TableHead className="hidden md:table-cell">Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Updated</TableHead>
                  <TableHead className="hidden md:table-cell">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sourceTasks.map((item: QueueItem) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center text-blue-600 hover:underline"
                        >
                          {new URL(item.url).hostname}
                          <ExternalLink className="ml-1 h-3 w-3 flex-shrink-0" />
                        </a>
                      ) : (
                        "Unknown"
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {item.company_name || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusVariants[item.status]}>{item.status}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="flex items-center text-muted-foreground">
                        <Clock className="mr-1 h-3 w-3" />
                        {formatRelativeTime(item.updated_at)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell max-w-[200px] truncate">
                      {item.result_message || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
