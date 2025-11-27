import { useEffect, useMemo, useState } from "react"
import { queueClient } from "@/api"
import { useJobSources } from "@/hooks/useJobSources"
import type { JobSource, ScrapeConfig } from "@shared/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, X } from "lucide-react"

type ScrapeJobDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitted?: () => Promise<void> | void
  /** Pre-select a source id when opening (e.g., from Sources table) */
  prefillSourceId?: string | null
  /** Optional caller-provided sources; otherwise the dialog fetches */
  sources?: JobSource[]
}

type ScrapeFormState = {
  targetMatches: string
  maxSources: string
  selectedSourceIds: string[]
}

export function ScrapeJobDialog({
  open,
  onOpenChange,
  onSubmitted,
  prefillSourceId,
  sources: providedSources,
}: ScrapeJobDialogProps) {
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState<ScrapeFormState>({
    targetMatches: "",
    maxSources: "",
    selectedSourceIds: prefillSourceId ? [prefillSourceId] : [],
  })
  const [sourceSearch, setSourceSearch] = useState("")

  const { sources: fetchedSources, loading: loadingSources } = useJobSources({
    limit: 200,
    autoFetch: !providedSources,
  })

  const sources = useMemo(() => providedSources ?? fetchedSources, [providedSources, fetchedSources])

  // Keep prefill in sync when dialog opens
  useEffect(() => {
    if (open) {
      setForm((prev) => ({
        ...prev,
        selectedSourceIds: prefillSourceId ? [prefillSourceId] : [],
      }))
    }
  }, [open, prefillSourceId])

  const toggleSource = (id: string) => {
    setForm((prev) => {
      const exists = prev.selectedSourceIds.includes(id)
      return {
        ...prev,
        selectedSourceIds: exists
          ? prev.selectedSourceIds.filter((s) => s !== id)
          : [...prev.selectedSourceIds, id],
      }
    })
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const config: ScrapeConfig = {}

      const trimmedTarget = form.targetMatches.trim()
      const trimmedMax = form.maxSources.trim()

      if (trimmedTarget !== "") {
        const num = Number.parseInt(trimmedTarget, 10)
        config.target_matches = Number.isNaN(num) ? null : num
      } else {
        config.target_matches = null
      }

      if (trimmedMax !== "") {
        const num = Number.parseInt(trimmedMax, 10)
        config.max_sources = Number.isNaN(num) ? null : num
      } else {
        config.max_sources = null
      }

      if (form.selectedSourceIds.length > 0) {
        config.source_ids = form.selectedSourceIds
      }

      await queueClient.submitScrape({ scrapeConfig: config })
      await onSubmitted?.()
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to create scrape job", error)
    } finally {
      setSubmitting(false)
    }
  }

  const selectableSources = useMemo(
    () => sources.filter((s): s is JobSource & { id: string } => typeof s.id === "string" && s.id.length > 0),
    [sources]
  )

  const filteredSources = useMemo(() => {
    const term = sourceSearch.trim().toLowerCase()
    if (!term) return selectableSources
    return selectableSources.filter((s) => s.name.toLowerCase().includes(term))
  }, [selectableSources, sourceSearch])

  const selectedBadges: Array<JobSource & { id: string }> = form.selectedSourceIds
    .map((id) => selectableSources.find((s) => s.id === id))
    .filter((s): s is JobSource & { id: string } => Boolean(s?.id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a scrape</DialogTitle>
          <DialogDescription>
            Pick target thresholds and which sources to include. Leave limits blank for no cap.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="targetMatches">Target matches</Label>
              <Input
                id="targetMatches"
                type="number"
                min={1}
                placeholder="Stop after this many jobs"
                value={form.targetMatches}
                onChange={(e) => setForm((prev) => ({ ...prev, targetMatches: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Jobs counted after pre-filtering. Leave blank to scrape until sources are exhausted.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxSources">Max sources</Label>
              <Input
                id="maxSources"
                type="number"
                min={1}
                placeholder="How many sources to scrape"
                value={form.maxSources}
                onChange={(e) => setForm((prev) => ({ ...prev, maxSources: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Leave blank to allow all eligible sources.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sources to scrape</Label>
            <div className="space-y-2">
              <Input
                placeholder="Search sources"
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.target.value)}
              />
              <div className="border rounded-md">
                <ScrollArea className="h-52">
                  <div className="p-2 space-y-2">
                    {loadingSources ? (
                      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading sources...
                      </div>
                    ) : filteredSources.length === 0 ? (
                      <div className="text-sm text-muted-foreground py-4 text-center">No sources match.</div>
                    ) : (
                      filteredSources.map((source) => {
                        if (!source.id) return null
                        const selected = form.selectedSourceIds.includes(source.id)
                        return (
                          <label key={source.id} className="flex items-start gap-2 cursor-pointer">
                            <Checkbox checked={selected} onCheckedChange={() => toggleSource(source.id)} />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium leading-tight">{source.name}</span>
                              <span className="text-xs text-muted-foreground">{source.sourceType}</span>
                            </div>
                          </label>
                        )
                      })
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>

            {selectedBadges.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedBadges.map((source) => (
                  <Badge key={source.id} variant="secondary" className="flex items-center gap-1">
                    {source.name}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 p-0"
                      onClick={() => toggleSource(source.id)}
                      aria-label={`Remove ${source.name}`}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}

            <Separator />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Creating..." : "Create scrape"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
