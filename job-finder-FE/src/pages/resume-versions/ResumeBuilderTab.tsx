import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Download, FileText } from "lucide-react"
import { resumeVersionsClient } from "@/api"
import type { ResumeItemNode, ContentFitEstimate } from "@shared/types"
import { cn } from "@/lib/utils"

interface ResumeBuilderTabProps {
  items: ResumeItemNode[]
}

/** Flatten the pool tree, unwrapping section containers, grouping by aiContext. */
function categorizeItems(items: ResumeItemNode[]) {
  const narratives: ResumeItemNode[] = []
  const work: ResumeItemNode[] = []
  const skills: ResumeItemNode[] = []
  const projects: ResumeItemNode[] = []
  const education: ResumeItemNode[] = []

  function walk(nodes: ResumeItemNode[]) {
    for (const node of [...nodes].sort((a, b) => a.orderIndex - b.orderIndex)) {
      switch (node.aiContext) {
        case "narrative":
          narratives.push(node)
          break
        case "work":
          work.push(node)
          break
        case "skills":
          skills.push(node)
          break
        case "project":
          projects.push(node)
          break
        case "education":
          education.push(node)
          break
        case "section":
          // Unwrap section containers — process their children
          if (node.children) walk(node.children)
          break
        default:
          // Standalone highlights or unknown — skip at top level
          break
      }
    }
  }

  walk(items)
  return { narratives, work, skills, projects, education }
}

/** Toggle an item and all its highlight children in/out of a Set. */
function toggleWithChildren(
  prev: Set<string>,
  item: ResumeItemNode
): Set<string> {
  const next = new Set(prev)
  const wasSelected = next.has(item.id)

  if (wasSelected) {
    next.delete(item.id)
    for (const child of item.children ?? []) {
      next.delete(child.id)
    }
  } else {
    next.add(item.id)
    for (const child of item.children ?? []) {
      if (child.aiContext === "highlight") {
        next.add(child.id)
      }
    }
  }
  return next
}

const USAGE_THRESHOLD_OK = 85
const USAGE_THRESHOLD_WARN = 100

export function ResumeBuilderTab({ items }: ResumeBuilderTabProps) {
  const { narratives, work, skills, projects, education } = useMemo(
    () => categorizeItems(items),
    [items]
  )

  // Selection state
  const [selectedNarrative, setSelectedNarrative] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [jobTitle, setJobTitle] = useState("")

  // Estimation state
  const [contentFit, setContentFit] = useState<ContentFitEstimate | null>(null)
  const [estimating, setEstimating] = useState(false)

  // Build state
  const [building, setBuilding] = useState(false)
  const [buildReady, setBuildReady] = useState(false)
  const [buildError, setBuildError] = useState<string | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const estimateSeqRef = useRef(0) // monotonic counter to discard stale responses

  // All selected IDs for the API
  const allSelectedIds = useMemo(() => {
    const ids = [...selected]
    if (selectedNarrative && !selected.has(selectedNarrative)) {
      ids.push(selectedNarrative)
    }
    return ids
  }, [selected, selectedNarrative])

  // Debounced estimation
  const requestEstimate = useCallback(
    (ids: string[], title?: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current)

      if (ids.length === 0) {
        setContentFit(null)
        setEstimating(false)
        return
      }

      setEstimating(true)
      const seq = ++estimateSeqRef.current
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await resumeVersionsClient.estimateResume(
            ids,
            title || undefined
          )
          // Only apply if this is still the latest request
          if (seq === estimateSeqRef.current) {
            setContentFit(res.contentFit)
          }
        } catch {
          // Error toast is already shown by the base client.
          // Clear stale fit data so the UI doesn't show outdated info.
          if (seq === estimateSeqRef.current) {
            setContentFit(null)
          }
        } finally {
          if (seq === estimateSeqRef.current) {
            setEstimating(false)
          }
        }
      }, 300)
    },
    []
  )

  // Trigger estimation on selection change
  useEffect(() => {
    requestEstimate(allSelectedIds, jobTitle)
    setBuildReady(false) // invalidate previous build
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [allSelectedIds, jobTitle, requestEstimate])

  // Toggle a leaf item (skills, education — no children to manage)
  const toggleItem = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  // Toggle a parent item (work, project) — auto-include/exclude all highlight children
  const toggleParent = useCallback((item: ResumeItemNode) => {
    setSelected((prev) => toggleWithChildren(prev, item))
  }, [])

  // Toggle an individual highlight child
  const toggleHighlight = useCallback((highlightId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(highlightId)) {
        next.delete(highlightId)
      } else {
        next.add(highlightId)
      }
      return next
    })
  }, [])

  const handleBuild = async () => {
    if (allSelectedIds.length === 0) return
    setBuilding(true)
    setBuildError(null)
    setBuildReady(false)
    try {
      const res = await resumeVersionsClient.buildCustomResume(
        allSelectedIds,
        jobTitle || undefined
      )
      setContentFit(res.contentFit)
      setBuildReady(true)
    } catch (err) {
      setBuildError((err as Error).message)
    } finally {
      setBuilding(false)
    }
  }

  const handleDownload = () => {
    window.open(
      resumeVersionsClient.getCustomBuildPdfUrl(),
      "_blank",
      "noopener,noreferrer"
    )
  }

  const hasSelection = allSelectedIds.length > 0

  return (
    <div className="space-y-4">
      {/* Sticky estimation bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b pb-3 pt-1 -mx-1 px-1">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            {contentFit ? (
              <ContentFitBar fit={contentFit} estimating={estimating} />
            ) : estimating ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Estimating...
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select items to see page fit estimate
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {buildReady && (
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="mr-1.5 h-4 w-4" /> Download PDF
              </Button>
            )}
            <Button
              size="sm"
              disabled={!hasSelection || building}
              onClick={handleBuild}
            >
              {building ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Building...
                </>
              ) : (
                <>
                  <FileText className="mr-1.5 h-4 w-4" /> Generate PDF
                </>
              )}
            </Button>
          </div>
        </div>
        {buildError && (
          <p className="text-xs text-destructive mt-1.5">{buildError}</p>
        )}
      </div>

      {/* Optional job title */}
      <div className="max-w-sm">
        <Label htmlFor="builder-job-title" className="text-xs text-muted-foreground">
          Job Title (optional — used in resume header)
        </Label>
        <Input
          id="builder-job-title"
          placeholder="e.g. Senior Software Engineer"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          className="h-8 text-sm"
        />
      </div>

      {/* Summary / Narrative selection (radio) */}
      {narratives.length > 0 && (
        <CategorySection title="Summary" count={selectedNarrative ? 1 : 0} total={narratives.length}>
          <div className="space-y-2">
            {narratives.map((n) => (
              <label
                key={n.id}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors",
                  selectedNarrative === n.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <input
                  type="radio"
                  name="narrative"
                  checked={selectedNarrative === n.id}
                  onClick={() => {
                    if (selectedNarrative === n.id) {
                      setSelectedNarrative(null)
                    }
                  }}
                  onChange={() => setSelectedNarrative(n.id)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <div className="flex-1 min-w-0">
                  {n.title && (
                    <span className="text-sm font-medium block">{n.title}</span>
                  )}
                  {n.description && (
                    <span className="text-xs text-muted-foreground line-clamp-3">
                      {n.description}
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
        </CategorySection>
      )}

      {/* Experience selection */}
      {work.length > 0 && (
        <CategorySection
          title="Experience"
          count={work.filter((w) => selected.has(w.id)).length}
          total={work.length}
        >
          <div className="space-y-3">
            {work.map((w) => {
              const isSelected = selected.has(w.id)
              const highlights = (w.children ?? [])
                .filter((c) => c.aiContext === "highlight")
                .sort((a, b) => a.orderIndex - b.orderIndex)
              const selectedHighlights = highlights.filter((h) =>
                selected.has(h.id)
              )

              return (
                <div
                  key={w.id}
                  className={cn(
                    "rounded-md border p-3 transition-colors",
                    isSelected
                      ? "border-primary/50 bg-primary/5"
                      : "border-border"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleParent(w)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">
                          {w.title}
                          {w.role && (
                            <span className="text-muted-foreground font-normal">
                              {" "}
                              &mdash; {w.role}
                            </span>
                          )}
                        </span>
                        {(w.startDate || w.endDate) && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {w.startDate} &ndash; {w.endDate ?? "present"}
                          </span>
                        )}
                      </div>
                      {w.location && (
                        <span className="text-xs text-muted-foreground">
                          {w.location}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Highlight children */}
                  {isSelected && highlights.length > 0 && (
                    <div className="mt-2 ml-7 space-y-1.5">
                      <span className="text-xs text-muted-foreground">
                        {selectedHighlights.length}/{highlights.length} highlights
                      </span>
                      {highlights.map((h) => (
                        <label
                          key={h.id}
                          className="flex items-start gap-2 cursor-pointer"
                        >
                          <Checkbox
                            checked={selected.has(h.id)}
                            onCheckedChange={() => toggleHighlight(h.id)}
                            className="mt-0.5"
                          />
                          <span className="text-xs text-foreground/80 line-clamp-2">
                            {h.description}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CategorySection>
      )}

      {/* Skills selection */}
      {skills.length > 0 && (
        <CategorySection
          title="Skills"
          count={skills.filter((s) => selected.has(s.id)).length}
          total={skills.length}
        >
          <div className="space-y-2">
            {skills.map((s) => (
              <label
                key={s.id}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors",
                  selected.has(s.id)
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <Checkbox
                  checked={selected.has(s.id)}
                  onCheckedChange={() => toggleItem(s.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{s.title}</span>
                  {s.skills && s.skills.length > 0 && (
                    <span className="text-xs text-muted-foreground block">
                      {s.skills.join(", ")}
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
        </CategorySection>
      )}

      {/* Projects selection */}
      {projects.length > 0 && (
        <CategorySection
          title="Projects"
          count={projects.filter((p) => selected.has(p.id)).length}
          total={projects.length}
        >
          <div className="space-y-2">
            {projects.map((p) => {
              const isSelected = selected.has(p.id)
              const highlights = (p.children ?? [])
                .filter((c) => c.aiContext === "highlight")
                .sort((a, b) => a.orderIndex - b.orderIndex)
              const selectedHighlights = highlights.filter((h) =>
                selected.has(h.id)
              )

              return (
                <div
                  key={p.id}
                  className={cn(
                    "rounded-md border p-3 transition-colors",
                    isSelected
                      ? "border-primary/50 bg-primary/5"
                      : "border-border"
                  )}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleParent(p)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{p.title}</span>
                      {p.description && (
                        <span className="text-xs text-muted-foreground block line-clamp-2">
                          {p.description}
                        </span>
                      )}
                    </div>
                  </label>
                  {isSelected && highlights.length > 0 && (
                    <div className="mt-2 ml-7 space-y-1.5">
                      <span className="text-xs text-muted-foreground">
                        {selectedHighlights.length}/{highlights.length} highlights
                      </span>
                      {highlights.map((h) => (
                        <label
                          key={h.id}
                          className="flex items-start gap-2 cursor-pointer"
                        >
                          <Checkbox
                            checked={selected.has(h.id)}
                            onCheckedChange={() => toggleHighlight(h.id)}
                            className="mt-0.5"
                          />
                          <span className="text-xs text-foreground/80 line-clamp-2">
                            {h.description}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </CategorySection>
      )}

      {/* Education selection */}
      {education.length > 0 && (
        <CategorySection
          title="Education"
          count={education.filter((e) => selected.has(e.id)).length}
          total={education.length}
        >
          <div className="space-y-2">
            {education.map((e) => (
              <label
                key={e.id}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors",
                  selected.has(e.id)
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:bg-muted/50"
                )}
              >
                <Checkbox
                  checked={selected.has(e.id)}
                  onCheckedChange={() => toggleItem(e.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{e.title}</span>
                  {e.role && (
                    <span className="text-xs text-muted-foreground block">
                      {e.role}
                    </span>
                  )}
                  {(e.startDate || e.endDate) && (
                    <span className="text-xs text-muted-foreground block">
                      {e.startDate} &ndash; {e.endDate ?? "present"}
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>
        </CategorySection>
      )}
    </div>
  )
}

function CategorySection({
  title,
  count,
  total,
  children,
}: {
  title: string
  count: number
  total: number
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>{title}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {count}/{total} selected
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function ContentFitBar({
  fit,
  estimating,
}: {
  fit: ContentFitEstimate
  estimating: boolean
}) {
  const barColor =
    fit.usagePercent <= USAGE_THRESHOLD_OK
      ? "bg-green-500"
      : fit.usagePercent <= USAGE_THRESHOLD_WARN
        ? "bg-amber-500"
        : "bg-red-500"

  const textColor =
    fit.usagePercent <= USAGE_THRESHOLD_OK
      ? "text-green-700"
      : fit.usagePercent <= USAGE_THRESHOLD_WARN
        ? "text-amber-700"
        : "text-red-700"

  const label = fit.fits
    ? `${fit.usagePercent}% of 1 page`
    : `${fit.usagePercent}% — overflows to ${fit.pageCount} pages`

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          Page Usage
          {estimating && <Loader2 className="h-3 w-3 animate-spin" />}
        </span>
        <span className={cn("text-xs font-semibold", textColor)}>{label}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", barColor)}
          style={{ width: `${Math.min(fit.usagePercent, 100)}%` }}
        />
      </div>
      {fit.suggestions.length > 0 && (
        <div className="mt-1">
          {fit.suggestions.map((s, i) => (
            <p key={i} className="text-xs text-amber-600">
              {s}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
