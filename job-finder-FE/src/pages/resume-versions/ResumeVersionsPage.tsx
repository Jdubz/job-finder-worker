import { useEffect, useMemo, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Plus, FileText, Sparkles, Download, CheckCircle } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useResumeVersion } from "@/hooks/useResumeVersion"
import { resumeVersionsClient } from "@/api"
import { jobMatchesClient } from "@/api"
import { ContentItemForm } from "../content-items/components/ContentItemForm"
import { ContentItemCard } from "../content-items/components/ContentItemCard"
import type { ContentItemFormValues } from "@/types/content-items"
import type {
  ContentItemNode,
  ContentFitEstimate,
  ResumeItemNode,
  PoolHealthSummary,
  TailorResumeResponse
} from "@shared/types"
import { cn } from "@/lib/utils"

/** Map a ResumeItemNode to a ContentItemNode by picking only the shared fields. */
function toContentItemNode(node: ResumeItemNode): ContentItemNode {
  return {
    id: node.id,
    parentId: node.parentId,
    orderIndex: node.orderIndex,
    aiContext: node.aiContext,
    title: node.title,
    role: node.role,
    location: node.location,
    website: node.website,
    startDate: node.startDate,
    endDate: node.endDate,
    description: node.description,
    skills: node.skills,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    createdBy: node.createdBy,
    updatedBy: node.updatedBy,
    children: node.children?.map(toContentItemNode)
  }
}

function sortNodesByOrder(nodes: ResumeItemNode[]): ResumeItemNode[] {
  return [...nodes]
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((node) => ({
      ...node,
      children: node.children ? sortNodesByOrder(node.children) : undefined
    }))
}

interface AlertState {
  type: "success" | "error"
  message: string
}

export function ResumeVersionsPage() {
  const { user, isOwner } = useAuth()
  const [editMode, setEditMode] = useState(false)
  const [showRootForm, setShowRootForm] = useState(false)
  const [alert, setAlert] = useState<AlertState | null>(null)
  const [poolHealth, setPoolHealth] = useState<PoolHealthSummary | null>(null)

  const isAdmin = Boolean(user?.email && isOwner)
  const canEdit = isAdmin && editMode

  const {
    version,
    items,
    contentFit: _contentFit,
    loading: versionLoading,
    error: versionError,
    createItem,
    updateItem,
    deleteItem,
    reorderItem,
    refetch: _refetch,
  } = useResumeVersion("pool")

  const sortedItems = useMemo(() => sortNodesByOrder(items), [items])
  const contentItems = useMemo(() => sortedItems.map(toContentItemNode), [sortedItems])

  // Load pool health stats
  useEffect(() => {
    resumeVersionsClient.getPoolHealth()
      .then(setPoolHealth)
      .catch(() => {}) // non-critical
  }, [items])

  const handleCreateRoot = async (values: ContentItemFormValues) => {
    try {
      await createItem({ ...values, parentId: null })
      setShowRootForm(false)
      setAlert({ type: "success", message: "Item created" })
    } catch (err) {
      setAlert({ type: "error", message: (err as Error).message })
    }
  }

  const handleCreateChild = async (parentId: string, values: ContentItemFormValues) => {
    try {
      await createItem({ ...values, parentId })
    } catch (err) {
      setAlert({ type: "error", message: (err as Error).message })
    }
  }

  const handleSaveItem = async (id: string, values: ContentItemFormValues) => {
    try {
      await updateItem(id, values)
    } catch (err) {
      setAlert({ type: "error", message: (err as Error).message })
    }
  }

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteItem(id)
    } catch (err) {
      setAlert({ type: "error", message: (err as Error).message })
    }
  }

  const handleReorder = async (id: string, parentId: string | null, orderIndex: number) => {
    try {
      await reorderItem(id, parentId, orderIndex)
    } catch (err) {
      setAlert({ type: "error", message: (err as Error).message })
    }
  }

  if (versionLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (versionError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load resume pool: {versionError.message}</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resume Pool</h1>
          <p className="text-muted-foreground">
            Curated pool of resume content. AI selects the best subset per job application.
          </p>
        </div>
        {isAdmin && (
          <Button
            variant={editMode ? "default" : "outline"}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? "Exit Edit Mode" : "Edit Mode"}
          </Button>
        )}
      </div>

      {alert && (
        <Alert variant={alert.type === "error" ? "destructive" : "default"}>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        {/* Pool sidebar */}
        <div className="space-y-4">
          {poolHealth && <PoolHealthCard health={poolHealth} />}
          {isAdmin && <TestTailoringCard />}
        </div>

        {/* Pool content editor */}
        <div className="space-y-4">
          {version ? (
            <>
              {/* Items tree */}
              <div className="space-y-4">
                {canEdit && (
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRootForm(!showRootForm)}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add Section
                    </Button>
                  </div>
                )}

                {showRootForm && canEdit && (
                  <Card>
                    <CardContent className="pt-6">
                      <ContentItemForm
                        onSubmit={handleCreateRoot}
                        onCancel={() => setShowRootForm(false)}
                        submitLabel="Create Section"
                      />
                    </CardContent>
                  </Card>
                )}

                {sortedItems.length === 0 && !showRootForm ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                      <FileText className="mb-3 h-10 w-10" />
                      <p>No content in the pool yet.</p>
                      {canEdit && (
                        <p className="text-sm">Click "Add Section" to start building.</p>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  contentItems.map((item, index) => (
                    <ContentItemCard
                      key={item.id}
                      item={item}
                      siblings={contentItems}
                      index={index}
                      depth={0}
                      canEdit={canEdit}
                      onSave={handleSaveItem}
                      onDelete={handleDeleteItem}
                      onCreateChild={handleCreateChild}
                      onMove={handleReorder}
                    />
                  ))
                )}
              </div>
            </>
          ) : (
            <Alert>
              <AlertDescription>
                Resume pool not found. Run migration 063 to create it.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  )
}

function PoolHealthCard({ health }: { health: PoolHealthSummary }) {
  const stats = [
    { label: "Narratives", count: health.narratives, min: 3 },
    { label: "Experience", count: health.experiences, min: 3 },
    { label: "Highlights", count: health.highlights, min: 10 },
    { label: "Skill Groups", count: health.skillCategories, min: 3 },
    { label: "Projects", count: health.projects, min: 1 },
    { label: "Education", count: health.education, min: 1 },
  ]

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Pool Health</CardTitle>
        <CardDescription className="text-xs">{health.totalItems} total items</CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {stats.map(({ label, count, min }) => (
          <div key={label} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{label}</span>
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                count >= min
                  ? "text-green-600 border-green-200"
                  : "text-amber-600 border-amber-200"
              )}
            >
              {count}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function TestTailoringCard() {
  const [jobMatchId, setJobMatchId] = useState("")
  const [tailoring, setTailoring] = useState(false)
  const [result, setResult] = useState<TailorResumeResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [jobMatches, setJobMatches] = useState<Array<{ id: string; title: string; company: string }>>([])
  const [loadingMatches, setLoadingMatches] = useState(false)

  // Load recent job matches for the dropdown
  useEffect(() => {
    setLoadingMatches(true)
    jobMatchesClient
      .listMatches({ limit: 20, sortBy: "updated", sortOrder: "desc", status: "active" })
      .then((matches) => {
        setJobMatches(
          matches
            .filter((m): m is typeof m & { id: string } => !!m.id)
            .map((m) => ({
              id: m.id,
              title: m.listing?.title || "Unknown",
              company: m.listing?.companyName || "Unknown"
            }))
        )
      })
      .catch(() => {})
      .finally(() => setLoadingMatches(false))
  }, [])

  const handleTailor = async () => {
    if (!jobMatchId) return
    setTailoring(true)
    setError(null)
    setResult(null)
    try {
      const res = await resumeVersionsClient.tailorResume(jobMatchId)
      setResult(res)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setTailoring(false)
    }
  }

  const handleDownload = () => {
    if (!result?.jobMatchId) return
    window.open(
      resumeVersionsClient.getTailoredPdfUrl(result.jobMatchId),
      "_blank",
      "noopener,noreferrer"
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-1.5">
          <Sparkles className="h-4 w-4" /> Test Tailoring
        </CardTitle>
        <CardDescription className="text-xs">
          Preview AI selection for a job match
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label htmlFor="test-job-match" className="text-xs">Job Match</Label>
          {loadingMatches ? (
            <div className="text-xs text-muted-foreground py-1">Loading...</div>
          ) : jobMatches.length > 0 ? (
            <select
              id="test-job-match"
              value={jobMatchId}
              onChange={(e) => setJobMatchId(e.target.value)}
              className="w-full h-8 text-sm rounded-md border border-input bg-background px-2"
            >
              <option value="">Select a job...</option>
              {jobMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title} @ {m.company}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id="test-job-match"
              placeholder="Job match ID"
              value={jobMatchId}
              onChange={(e) => setJobMatchId(e.target.value)}
              className="h-8 text-sm font-mono"
            />
          )}
        </div>

        <Button
          size="sm"
          className="w-full"
          disabled={!jobMatchId || tailoring}
          onClick={handleTailor}
        >
          {tailoring ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Tailoring...
            </>
          ) : (
            "Run Tailoring"
          )}
        </Button>

        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}

        {result && (
          <div className="space-y-2 border-t pt-2">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="h-3.5 w-3.5 text-green-600" />
              <span className="text-xs font-medium">
                {result.cached ? "Cached" : "Generated"} — {result.selectedItemIds.length} items
              </span>
            </div>
            {result.contentFit && (
              <ContentFitIndicator fit={result.contentFit} />
            )}
            {result.reasoning && (
              <p className="text-xs text-muted-foreground italic">{result.reasoning}</p>
            )}
            <Button variant="outline" size="sm" className="w-full" onClick={handleDownload}>
              <Download className="mr-1 h-3.5 w-3.5" /> Download PDF
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const USAGE_THRESHOLD_OK = 85
const USAGE_THRESHOLD_WARN = 100

function ContentFitIndicator({ fit }: { fit: ContentFitEstimate }) {
  const barColor = fit.usagePercent <= USAGE_THRESHOLD_OK
    ? "bg-green-500"
    : fit.usagePercent <= USAGE_THRESHOLD_WARN
      ? "bg-amber-500"
      : "bg-red-500"

  const textColor = fit.usagePercent <= USAGE_THRESHOLD_OK
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
        <span className="text-xs font-medium text-muted-foreground">Page Usage</span>
        <span className={cn("text-xs font-semibold", textColor)}>{label}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", barColor)}
          style={{ width: `${Math.min(fit.usagePercent, 100)}%` }}
        />
      </div>
    </div>
  )
}
