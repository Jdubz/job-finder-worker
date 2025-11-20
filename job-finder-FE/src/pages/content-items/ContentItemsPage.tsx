import { useMemo, useRef, useState, type ChangeEvent } from "react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Loader2, Plus, RefreshCcw, Upload, Download } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"
import { useContentItems } from "@/hooks/useContentItems"
import { contentItemsClient } from "@/api"
import { ContentItemForm } from "./components/ContentItemForm"
import { ContentItemCard } from "./components/ContentItemCard"
import type { ContentItemFormValues } from "@/types/content-items"
import type { ContentItemNode } from "@shared/types"
import {
  countNodes,
  flattenContentItems,
  normalizeImportNodes,
  serializeForExport,
  sortNodesByOrder
} from "./content-items.helpers"
import type { NormalizedImportNode } from "./content-items.helpers"

interface AlertState {
  type: "success" | "error"
  message: string
}

export function ContentItemsPage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { user } = useAuth()
  const {
    contentItems,
    loading,
    error,
    createContentItem,
    updateContentItem,
    deleteContentItem,
    reorderContentItem,
    refetch
  } = useContentItems()

  const [showRootForm, setShowRootForm] = useState(false)
  const [alert, setAlert] = useState<AlertState | null>(null)
  const [importing, setImporting] = useState(false)

  const sortedContentItems = useMemo(() => sortNodesByOrder(contentItems), [contentItems])
  const totalItems = useMemo(() => countNodes(sortedContentItems), [sortedContentItems])

  const handleCreateRoot = async (values: ContentItemFormValues) => {
    if (!user?.id) return
    await createContentItem({ ...values, userId: user.id, parentId: null })
    setShowRootForm(false)
  }

  const handleCreateChild = async (parentId: string, values: ContentItemFormValues) => {
    if (!user?.id) return
    await createContentItem({ ...values, userId: user.id, parentId })
  }

  const handleSaveItem = async (id: string, values: ContentItemFormValues) => {
    await updateContentItem(id, values)
  }

  const handleDeleteItem = async (id: string) => {
    await deleteContentItem(id)
  }

  const handleReorder = async (id: string, parentId: string | null, orderIndex: number) => {
    await reorderContentItem(id, parentId, orderIndex)
  }

  const handleExport = () => {
    if (!sortedContentItems.length) {
      setAlert({ type: "error", message: "No content items available to export." })
      return
    }

    const payload = serializeForExport(sortedContentItems)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `content-items-${new Date().toISOString()}.json`
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)

    const exportedCount = countNodes(payload)
    setAlert({
      type: "success",
      message: `Exported ${exportedCount} content item${exportedCount === 1 ? "" : "s"}.`
    })
  }

  const handleImportClick = () => {
    if (!user?.id || !user?.email) {
      setAlert({ type: "error", message: "You must be signed in to import content items." })
      return
    }
    fileInputRef.current?.click()
  }

  const handleImportChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!user?.id || !user?.email) {
      setAlert({ type: "error", message: "You must be signed in to import content items." })
      event.target.value = ""
      return
    }

    setImporting(true)
    setAlert(null)

    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const normalized = normalizeImportNodes(parsed)
      if (!normalized.length) {
        throw new Error("The import file does not contain any content items.")
      }

      const createdCount = await replaceContentItems({
        roots: normalized,
        currentItems: sortedContentItems,
        userId: user.id,
        userEmail: user.email
      })

      setAlert({
        type: "success",
        message: `Imported ${createdCount} content item${createdCount === 1 ? "" : "s"}.`
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to import content items."
      setAlert({ type: "error", message })
    } finally {
      event.target.value = ""
      setImporting(false)
      await refetch()
    }
  }

  const handleRefresh = async () => {
    setAlert(null)
    await refetch()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Content Items</h1>
          <p className="text-sm text-muted-foreground">
            Unified resume content with nested hierarchy and inline editing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleImportChange}
          />
          <Button variant="outline" onClick={handleRefresh} disabled={loading || importing}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={!totalItems || importing}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button onClick={handleImportClick} disabled={importing}>
            {importing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {importing ? "Importing…" : "Import"}
          </Button>
          <Button onClick={() => setShowRootForm((prev) => !prev)}>
            <Plus className="mr-2 h-4 w-4" /> {showRootForm ? "Hide Root Form" : "Add Root Item"}
          </Button>
        </div>
      </div>

      {alert && (
        <Alert variant={alert.type === "error" ? "destructive" : "default"}>
          <AlertDescription>{alert.message}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      {showRootForm && (
        <div className="rounded-lg border bg-card p-4">
          <h2 className="mb-3 text-lg font-semibold">Create Root Item</h2>
          <ContentItemForm
            onSubmit={handleCreateRoot}
            onCancel={() => setShowRootForm(false)}
            submitLabel="Create Item"
          />
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading content items…
        </div>
      )}

      {!loading && !sortedContentItems.length && (
        <div className="rounded-lg border border-dashed bg-muted/40 p-6 text-center text-sm text-muted-foreground">
          No content items yet. Use the "Add Root Item" button or import from JSON to get started.
        </div>
      )}

      <div className="space-y-4" data-testid="content-items-root">
        {sortedContentItems.map((item, index) => (
          <ContentItemCard
            key={item.id}
            item={item}
            siblings={sortedContentItems}
            index={index}
            onSave={handleSaveItem}
            onDelete={handleDeleteItem}
            onCreateChild={handleCreateChild}
            onMove={handleReorder}
          />
        ))}
      </div>
    </div>
  )
}

async function replaceContentItems({
  roots,
  currentItems,
  userId,
  userEmail
}: {
  roots: NormalizedImportNode[]
  currentItems: ContentItemNode[]
  userId: string
  userEmail: string
}): Promise<number> {
  const allExisting = flattenContentItems(currentItems)
  for (const item of allExisting) {
    await contentItemsClient.deleteContentItem(item.id)
  }

  let created = 0

  const createTree = async (nodes: NormalizedImportNode[], parentId: string | null) => {
    for (const node of nodes) {
      const payload = {
        ...node.values,
        userId,
        parentId,
        order: Number.isFinite(node.order) ? node.order : undefined
      }
      const createdItem = await contentItemsClient.createContentItem(userEmail, payload)
      created += 1
      if (node.children.length) {
        await createTree(node.children, createdItem.id)
      }
    }
  }

  await createTree(roots, null)
  return created
}
