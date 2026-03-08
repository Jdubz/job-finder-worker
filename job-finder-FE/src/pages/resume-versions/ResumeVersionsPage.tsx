import { useMemo, useState } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, Plus, Download, Upload, FileText } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useResumeVersions } from "./hooks/useResumeVersions"
import { useResumeVersion } from "@/hooks/useResumeVersion"
import { resumeVersionsClient } from "@/api"
import { ContentItemForm } from "../content-items/components/ContentItemForm"
import { ContentItemCard } from "../content-items/components/ContentItemCard"
import type { ContentItemFormValues } from "@/types/content-items"
import type { ContentItemNode } from "@shared/types"
import type { ResumeVersion, ResumeItemNode } from "@shared/types"
import { cn } from "@/lib/utils"

function sortNodesByOrder(nodes: ResumeItemNode[]): ResumeItemNode[] {
  return [...nodes]
    .sort((a, b) => a.order - b.order)
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
  const { versions, loading: versionsLoading } = useResumeVersions()
  const [selectedSlug, setSelectedSlug] = useState<string>("frontend")
  const [editMode, setEditMode] = useState(false)
  const [showRootForm, setShowRootForm] = useState(false)
  const [alert, setAlert] = useState<AlertState | null>(null)

  const isAdmin = Boolean(user?.email && isOwner)
  const canEdit = isAdmin && editMode

  const {
    version,
    items,
    loading: versionLoading,
    publishing,
    createItem,
    updateItem,
    deleteItem,
    reorderItem,
    publish,
  } = useResumeVersion(selectedSlug)

  const sortedItems = useMemo(() => sortNodesByOrder(items), [items])

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

  const handlePublish = async () => {
    try {
      await publish()
      setAlert({ type: "success", message: `Resume "${version?.name}" published successfully` })
    } catch (err) {
      setAlert({ type: "error", message: (err as Error).message })
    }
  }

  const handleDownload = () => {
    if (!selectedSlug) return
    window.open(resumeVersionsClient.getPdfUrl(selectedSlug), "_blank")
  }

  if (versionsLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Resume Versions</h1>
          <p className="text-muted-foreground">
            Manage role-targeted resume versions. Each version renders to a single PDF.
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
        {/* Version sidebar */}
        <div className="space-y-2">
          {versions.map((v) => (
            <VersionCard
              key={v.slug}
              version={v}
              isSelected={v.slug === selectedSlug}
              onClick={() => setSelectedSlug(v.slug)}
            />
          ))}
        </div>

        {/* Version detail panel */}
        <div className="space-y-4">
          {versionLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : version ? (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{version.name}</CardTitle>
                      <CardDescription>{version.description}</CardDescription>
                    </div>
                    <div className="flex gap-2">
                      {version.pdfPath && (
                        <Button variant="outline" size="sm" onClick={handleDownload}>
                          <Download className="mr-1 h-4 w-4" /> Download PDF
                        </Button>
                      )}
                      {canEdit && (
                        <Button
                          size="sm"
                          onClick={handlePublish}
                          disabled={publishing || sortedItems.length === 0}
                        >
                          {publishing ? (
                            <>
                              <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Publishing...
                            </>
                          ) : (
                            <>
                              <Upload className="mr-1 h-4 w-4" /> Publish
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  {version.publishedAt && (
                    <p className="text-xs text-muted-foreground">
                      Published {new Date(version.publishedAt as string | number).toLocaleDateString()}{" "}
                      by {version.publishedBy}
                    </p>
                  )}
                </CardHeader>
              </Card>

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
                      <p>No content yet for this resume version.</p>
                      {canEdit && (
                        <p className="text-sm">Click "Add Section" to start building.</p>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  sortedItems.map((item, index) => (
                    <ContentItemCard
                      key={item.id}
                      item={item as unknown as ContentItemNode}
                      siblings={sortedItems as unknown as ContentItemNode[]}
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
            <p className="text-muted-foreground">Select a resume version.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function VersionCard({
  version,
  isSelected,
  onClick
}: {
  version: ResumeVersion
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        isSelected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:bg-muted/50"
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">{version.name}</span>
        {version.pdfPath ? (
          <Badge variant="outline" className="text-xs text-green-600 border-green-200">
            Published
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs text-amber-600 border-amber-200">
            Draft
          </Badge>
        )}
      </div>
      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{version.description}</p>
      {version.publishedAt && (
        <p className="mt-1 text-xs text-muted-foreground">
          {new Date(version.publishedAt as string | number).toLocaleDateString()}
        </p>
      )}
    </button>
  )
}
