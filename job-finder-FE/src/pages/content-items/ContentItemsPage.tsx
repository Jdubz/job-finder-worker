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
import type { ContentItemNode, ContentItemVisibility } from "@shared/types"

interface AlertState {
  type: "success" | "error"
  message: string
}

interface NormalizedImportNode {
  legacyId: string
  parentLegacyId: string | null
  order: number
  values: ContentItemFormValues
  children: NormalizedImportNode[]
}

interface SerializedContentItem {
  id: string
  parentId: string | null
  order: number
  title?: string
  role?: string
  location?: string
  website?: string
  startDate?: string
  endDate?: string
  description?: string
  skills?: string[]
  visibility: ContentItemVisibility
  children?: SerializedContentItem[]
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

      <div className="space-y-4">
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

function flattenContentItems(nodes: ContentItemNode[]): ContentItemNode[] {
  const result: ContentItemNode[] = []
  const stack = [...nodes]
  while (stack.length) {
    const node = stack.shift()
    if (!node) continue
    result.push(node)
    if (node.children?.length) {
      stack.unshift(...node.children)
    }
  }
  return result
}

function countNodes<T extends { children?: T[] }>(nodes: T[]): number {
  let total = 0
  const stack = [...nodes]
  while (stack.length) {
    const node = stack.pop()
    if (!node) continue
    total += 1
    if (node.children?.length) {
      stack.push(...node.children)
    }
  }
  return total
}

function sortNodesByOrder(nodes: ContentItemNode[]): ContentItemNode[] {
  const sortRecursive = (items: ContentItemNode[]): ContentItemNode[] =>
    items
      .map((item) => ({
        ...item,
        children: item.children ? sortRecursive(item.children) : undefined
      }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  return sortRecursive(nodes)
}

function serializeForExport(nodes: ContentItemNode[]): SerializedContentItem[] {
  return nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    order: node.order,
    title: node.title ?? undefined,
    role: node.role ?? undefined,
    location: node.location ?? undefined,
    website: node.website ?? undefined,
    startDate: node.startDate ?? undefined,
    endDate: node.endDate ?? undefined,
    description: node.description ?? undefined,
    skills: node.skills ?? undefined,
    visibility: node.visibility,
    children: node.children?.length ? serializeForExport(node.children) : undefined
  }))
}

function normalizeImportNodes(data: unknown): NormalizedImportNode[] {
  if (!Array.isArray(data)) {
    throw new Error("Import file must be a JSON array.")
  }

  const flattened = flattenInputRecords(data)
  const nodes = flattened.map((record, index) => buildNormalizedNode(record, index))
  const map = new Map<string, NormalizedImportNode>()
  nodes.forEach((node) => map.set(node.legacyId, node))

  const roots: NormalizedImportNode[] = []
  nodes.forEach((node) => {
    if (node.parentLegacyId && map.has(node.parentLegacyId)) {
      map.get(node.parentLegacyId)?.children.push(node)
    } else {
      roots.push(node)
    }
  })

  const sortRecursive = (items: NormalizedImportNode[]) => {
    items.sort((a, b) => a.order - b.order)
    items.forEach((child) => sortRecursive(child.children))
  }
  sortRecursive(roots)

  return roots
}

function flattenInputRecords(records: unknown[]): Array<Record<string, unknown>> {
  const result: Array<Record<string, unknown>> = []
  const walk = (node: unknown, treeParentId: string | null) => {
    if (!isRecord(node)) return
    const id = typeof node.id === "string" ? node.id : undefined
    const entry: Record<string, unknown> = { ...node, __treeParent: treeParentId }
    delete entry.children
    result.push(entry)
    const children = (node as { children?: unknown[] }).children
    if (Array.isArray(children)) {
      children.forEach((child) => walk(child, id ?? null))
    }
  }

  records.forEach((record) => walk(record, null))
  return result
}

function buildNormalizedNode(record: Record<string, unknown>, index: number): NormalizedImportNode {
  const expanded = expandRecord(record)
  const legacyId = typeof expanded.id === "string" && expanded.id.trim().length ? expanded.id : `import-${index}`
  const parentLegacyId = coerceParentId(expanded)
  const order = coerceOrder(expanded, index)
  const visibility = coerceVisibility(expanded.visibility)
  const values: ContentItemFormValues = {
    title: pickString(expanded, ["title", "name", "heading", "label"]),
    role: pickString(expanded, ["role", "position", "company", "subtitle", "category"]),
    location: pickString(expanded, ["location", "city", "region", "place"]),
    website: pickWebsite(expanded),
    startDate: pickString(expanded, ["startDate", "start_date", "start"]),
    endDate: pickString(expanded, ["endDate", "end_date", "end"]),
    description: buildDescription(expanded),
    skills: pickStringArray(expanded, ["skills", "technologies", "techStack", "stack", "keywords"]),
    visibility
  }

  ;(Object.keys(values) as Array<keyof ContentItemFormValues>).forEach((key) => {
    const value = values[key]
    if (value === undefined || value === null || value === "") {
      delete values[key]
    }
  })

  return {
    legacyId,
    parentLegacyId,
    order,
    values,
    children: []
  }
}

function expandRecord(record: Record<string, unknown>) {
  const body = isRecord(record.body) ? record.body : {}
  const bodyJson = isRecord(record.body_json) ? record.body_json : {}
  return { ...bodyJson, ...body, ...record }
}

function coerceParentId(record: Record<string, unknown>): string | null {
  if (typeof record.parentId === "string" && record.parentId.trim()) {
    return record.parentId
  }
  if (isRecord(record.parentId)) {
    const parentRecord = record.parentId
    if (typeof parentRecord.stringValue === "string" && parentRecord.stringValue.trim()) {
      return parentRecord.stringValue
    }
    if (Object.prototype.hasOwnProperty.call(parentRecord, "nullValue")) {
      return null
    }
  }
  if (typeof record.__treeParent === "string" && record.__treeParent.trim()) {
    return record.__treeParent
  }
  return null
}

function coerceOrder(record: Record<string, unknown>, fallback: number): number {
  const candidates = [record.order, record.order_index, record.orderIndex, record.position, record.rank]
  for (const candidate of candidates) {
    if (typeof candidate === "number") return candidate
    if (typeof candidate === "string" && candidate.trim()) {
      const parsed = Number.parseInt(candidate, 10)
      if (!Number.isNaN(parsed)) return parsed
    }
  }
  return fallback
}

function coerceVisibility(value: unknown): ContentItemVisibility | undefined {
  if (value === "published" || value === "draft" || value === "archived") {
    return value
  }
  return undefined
}

function pickString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
  }
  return undefined
}

function pickWebsite(record: Record<string, unknown>): string | undefined {
  const direct = pickString(record, ["website", "url", "link", "href"])
  if (direct) return direct
  if (Array.isArray(record.links) && record.links.length) {
    for (const link of record.links) {
      if (isRecord(link)) {
        const candidate = pickString(link, ["url", "href"])
        if (candidate) return candidate
      }
    }
  }
  return undefined
}

function pickStringArray(record: Record<string, unknown>, keys: string[]): string[] | undefined {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) {
      const normalized = value
        .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
        .filter(Boolean)
      if (normalized.length) return normalized
    }
    if (typeof value === "string" && value.trim()) {
      const parts = value
        .split(/[,;|]/)
        .map((part) => part.trim())
        .filter(Boolean)
      if (parts.length) return parts
    }
  }
  return undefined
}

function buildDescription(record: Record<string, unknown>): string | undefined {
  const base = pickString(record, ["description", "summary", "content", "body"])
  const bulletSources = [record.accomplishments, record.bullets, record.highlights, record.points]
  const bullets = bulletSources
    .filter((source): source is string[] => Array.isArray(source) && source.every((item) => typeof item === "string"))
    .flat()
    .map((line) => line.trim())
    .filter(Boolean)

  if (base && bullets.length) {
    return `${base}\n\n${bullets.map((line) => `- ${line}`).join("\n")}`
  }
  if (!base && bullets.length) {
    return bullets.map((line) => `- ${line}`).join("\n")
  }
  return base
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
