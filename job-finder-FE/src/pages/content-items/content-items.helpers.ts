import type { ContentItemNode } from "@shared/types"
import type { ContentItemFormValues } from "@/types/content-items"

export interface NormalizedImportNode {
  legacyId: string
  parentLegacyId: string | null
  order: number
  values: ContentItemFormValues
  children: NormalizedImportNode[]
}

export interface SerializedContentItem {
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
  children?: SerializedContentItem[]
}

export function countNodes<T extends { children?: T[] }>(nodes: T[]): number {
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

export function sortNodesByOrder(nodes: ContentItemNode[]): ContentItemNode[] {
  const sortRecursive = (items: ContentItemNode[]): ContentItemNode[] =>
    items
      .map((item) => ({
        ...item,
        children: item.children ? sortRecursive(item.children) : undefined
      }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  return sortRecursive(nodes)
}

export function serializeForExport(nodes: ContentItemNode[]): SerializedContentItem[] {
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
    children: node.children?.length ? serializeForExport(node.children) : undefined
  }))
}

export function flattenContentItems(nodes: ContentItemNode[]): ContentItemNode[] {
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

export function normalizeImportNodes(data: unknown): NormalizedImportNode[] {
  if (!Array.isArray(data)) {
    throw new Error("Import file must be a JSON array.")
  }

  const flattened = flattenInputRecords(data)
  const nodes = flattened.map((record, index) => buildNormalizedNode(record, index))
  const map = new Map<string, NormalizedImportNode>()
  nodes.forEach((node) => map.set(node.legacyId, node))

  const roots: NormalizedImportNode[] = []
  const createsCycle = (parentId: string, childId: string): boolean => {
    let current: string | null = parentId
    while (current) {
      if (current === childId) {
        return true
      }
      const ancestor = map.get(current)
      if (!ancestor || !ancestor.parentLegacyId) {
        break
      }
      current = ancestor.parentLegacyId
    }
    return false
  }
  nodes.forEach((node) => {
    const parentId = node.parentLegacyId
    if (parentId && map.has(parentId)) {
      if (createsCycle(parentId, node.legacyId)) {
        node.parentLegacyId = null
        roots.push(node)
      } else {
        map.get(parentId)?.children.push(node)
      }
    } else {
      roots.push(node)
    }
  })

  const sortRecursive = (items: NormalizedImportNode[], ancestors: Set<string>) => {
    items.sort((a, b) => a.order - b.order)
    items.forEach((child) => {
      if (ancestors.has(child.legacyId)) {
        child.children = []
        return
      }
      const nextAncestors = new Set(ancestors)
      nextAncestors.add(child.legacyId)
      sortRecursive(child.children, nextAncestors)
    })
  }
  sortRecursive(roots, new Set())

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
  const values: ContentItemFormValues = {
    title: pickString(expanded, ["title", "name", "heading", "label"]),
    role: pickString(expanded, ["role", "position", "company", "subtitle", "category"]),
    location: pickString(expanded, ["location", "city", "region", "place"]),
    website: pickWebsite(expanded),
    startDate: pickString(expanded, ["startDate", "start_date", "start"]),
    endDate: pickString(expanded, ["endDate", "end_date", "end"]),
    description: buildDescription(expanded),
    skills: pickStringArray(expanded, ["skills", "technologies", "techStack", "stack", "keywords"])
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
  const base = pickString(record, ["description", "summary", "content", "body", "biography", "bio", "about", "text"])
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
