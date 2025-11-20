#!/usr/bin/env node

/**
 * Normalizes legacy content-item exports and inserts them into SQLite.
 *
 * Usage:
 *   node scripts/migrate-content-items.js --input docs/content-items-export.json \\
 *     --db infra/sqlite/jobfinder.db --user-id <uuid> --user-email someone@example.com [--dry-run]
 */

import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import Database from "better-sqlite3"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function parseArgs(argv) {
  const map = new Map()
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg.startsWith("--")) {
      const next = argv[i + 1]
      if (!next || next.startsWith("--")) {
        map.set(arg, true)
      } else {
        map.set(arg, next)
        i += 1
      }
    }
  }
  return {
    input: map.get("--input") ?? path.resolve(__dirname, "../docs/content-items-export.json"),
    dbPath: map.get("--db") ?? path.resolve(__dirname, "../infra/sqlite/jobfinder.db"),
    userId: map.get("--user-id") ?? process.env.CONTENT_ITEMS_USER_ID,
    userEmail: map.get("--user-email") ?? process.env.CONTENT_ITEMS_USER_EMAIL,
    dryRun: map.has("--dry-run"),
    outputPath: map.get("--output") ?? null
  }
}

function assert(value, message) {
  if (!value) {
    throw new Error(message)
  }
}

function loadLegacyRecords(filePath) {
  const absolutePath = path.resolve(filePath)
  const raw = readFileSync(absolutePath, "utf8")
  const parsed = JSON.parse(raw)
  if (!Array.isArray(parsed)) {
    throw new Error(`Legacy export must be an array. Received ${typeof parsed}`)
  }
  return parsed
}

function normalizeRecords(records, defaults) {
  const flattened = flattenInputRecords(records)
  const nodes = flattened.map((record, index) => buildNormalizedNode(record, index, defaults))
  const map = new Map()
  nodes.forEach((node) => map.set(node.legacyId, node))

  const roots = []
  nodes.forEach((node) => {
    if (node.parentLegacyId && map.has(node.parentLegacyId)) {
      map.get(node.parentLegacyId).children.push(node)
    } else {
      roots.push(node)
    }
  })

  const sortRecursive = (items, ancestors) => {
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

function flattenInputRecords(records) {
  const result = []
  const walk = (node, treeParent) => {
    if (!isRecord(node)) return
    const id = typeof node.id === "string" ? node.id : undefined
    const entry = { ...node, __treeParent: treeParent }
    delete entry.children
    result.push(entry)
    if (Array.isArray(node.children)) {
      node.children.forEach((child) => walk(child, id ?? null))
    }
  }
  records.forEach((record) => walk(record, null))
  return result
}

function buildNormalizedNode(record, index, defaults) {
  const expanded = expandRecord(record)
  const legacyId = typeof expanded.id === "string" && expanded.id.trim().length ? expanded.id : `import-${index}`
  const parentLegacyId = coerceParentId(expanded)
  const order = coerceOrder(expanded, index)
  const values = {
    title: pickString(expanded, ["title", "name", "heading", "label"]),
    role: pickString(expanded, ["role", "position", "company", "subtitle", "category"]),
    location: pickString(expanded, ["location", "city", "region", "place"]),
    website: pickWebsite(expanded),
    startDate: pickString(expanded, ["startDate", "start_date", "start"]),
    endDate: pickString(expanded, ["endDate", "end_date", "end"]),
    description: buildDescription(expanded),
    skills: pickStringArray(expanded, ["skills", "technologies", "techStack", "stack", "keywords"])
  }

  const cleanValues = {}
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      cleanValues[key] = value
    }
  })

  const now = new Date().toISOString()
  const visibility =
    typeof expanded.visibility === "string" && expanded.visibility.trim()
      ? expanded.visibility
      : "draft"

  const createdAt = expanded.createdAt ?? now
  const updatedAt = expanded.updatedAt ?? createdAt
  const createdBy = expanded.createdBy ?? defaults.userEmail
  const updatedBy = expanded.updatedBy ?? createdBy
  const userId =
    typeof expanded.userId === "string" && expanded.userId.trim()
      ? expanded.userId
      : defaults.userId

  if (!userId) {
    throw new Error(`Unable to resolve userId for record ${legacyId}`)
  }

  return {
    legacyId,
    parentLegacyId,
    order,
    fields: cleanValues,
    meta: {
      userId,
      visibility,
      createdAt,
      updatedAt,
      createdBy,
      updatedBy
    },
    children: []
  }
}

function expandRecord(record) {
  const body = isRecord(record.body) ? record.body : {}
  const bodyJson = isRecord(record.body_json) ? record.body_json : {}
  return { ...bodyJson, ...body, ...record }
}

function coerceParentId(record) {
  if (typeof record.parentId === "string" && record.parentId.trim()) {
    return record.parentId
  }
  if (isRecord(record.parentId)) {
    const candidate = record.parentId
    if (typeof candidate.stringValue === "string" && candidate.stringValue.trim()) {
      return candidate.stringValue
    }
    if (Object.prototype.hasOwnProperty.call(candidate, "nullValue")) {
      return null
    }
  }
  if (typeof record.__treeParent === "string" && record.__treeParent.trim()) {
    return record.__treeParent
  }
  return null
}

function coerceOrder(record, fallback) {
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

function pickString(record, keys) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "string") {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
  }
  return undefined
}

function pickWebsite(record) {
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

function pickStringArray(record, keys) {
  for (const key of keys) {
    const value = record[key]
    if (Array.isArray(value)) {
      const normalized = value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean)
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

function buildDescription(record) {
  const base = pickString(record, ["description", "summary", "content", "body"])
  const bulletSources = [record.accomplishments, record.bullets, record.highlights, record.points]
  const bullets = bulletSources
    .filter((source) => Array.isArray(source) && source.every((item) => typeof item === "string"))
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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function insertNodes(db, nodes, options) {
  const insert = db.prepare(`
    INSERT INTO content_items (
      id,
      user_id,
      parent_id,
      order_index,
      title,
      role,
      location,
      website,
      start_date,
      end_date,
      description,
      skills,
      visibility,
      created_at,
      updated_at,
      created_by,
      updated_by
    ) VALUES (
      @id,
      @userId,
      @parentId,
      @orderIndex,
      @title,
      @role,
      @location,
      @website,
      @startDate,
      @endDate,
      @description,
      @skills,
      @visibility,
      @createdAt,
      @updatedAt,
      @createdBy,
      @updatedBy
    )
  `)

  const assign = (items, parentId) => {
    items
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((node, index) => {
        const orderIndex = Number.isFinite(node.order) ? node.order : index
        const payload = {
          id: node.legacyId,
          userId: node.meta.userId,
          parentId,
          orderIndex,
          title: node.fields.title ?? null,
          role: node.fields.role ?? null,
          location: node.fields.location ?? null,
          website: node.fields.website ?? null,
          startDate: node.fields.startDate ?? null,
          endDate: node.fields.endDate ?? null,
          description: node.fields.description ?? null,
          skills: Array.isArray(node.fields.skills) && node.fields.skills.length ? JSON.stringify(node.fields.skills) : null,
          visibility: node.meta.visibility,
          createdAt: node.meta.createdAt,
          updatedAt: node.meta.updatedAt,
          createdBy: node.meta.createdBy,
          updatedBy: node.meta.updatedBy
        }

        insert.run(payload)
        if (node.children.length) {
          assign(node.children, node.legacyId)
        }
      })
  }

  db.transaction(() => {
    db.prepare("DELETE FROM content_items").run()
    assign(nodes, null)
  })()
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  assert(options.userId, "Missing --user-id (or CONTENT_ITEMS_USER_ID)")
  assert(options.userEmail, "Missing --user-email (or CONTENT_ITEMS_USER_EMAIL)")

  console.log(`[content-items] Loading export from ${path.resolve(options.input)}`)
  const records = loadLegacyRecords(options.input)
  console.log(`[content-items] Normalizing ${records.length} legacy rows…`)
  const normalized = normalizeRecords(records, { userId: options.userId, userEmail: options.userEmail })
  console.log(`[content-items] Built ${normalized.length} root nodes (${countNodes(normalized)} total)`)

  if (options.outputPath) {
    const exported = serializeNormalized(normalized)
    writeFileSync(path.resolve(options.outputPath), `${JSON.stringify(exported, null, 2)}\n`, "utf8")
    console.log(`[content-items] Wrote normalized export to ${path.resolve(options.outputPath)}`)
  }

  if (options.dryRun) {
    console.log(`[dry-run] Parsed ${normalized.length} root items (${countNodes(normalized)} total).`)
    process.exit(0)
  }

  const db = new Database(path.resolve(options.dbPath))
  insertNodes(db, normalized, options)
  console.log(`[content-items] Migrated ${countNodes(normalized)} items into ${options.dbPath}`)
  db.close()
}

function countNodes(nodes) {
  let total = 0
  const queue = [...nodes]
  while (queue.length) {
    const node = queue.pop()
    if (!node) continue
    total += 1
    if (node.children.length) {
      queue.push(...node.children)
    }
  }
  return total
}

function serializeNormalized(nodes, parentId = null) {
  return nodes.map((node) => {
    const payload = {
      id: node.legacyId,
      parentId,
      order: node.order,
      title: node.fields.title ?? undefined,
      role: node.fields.role ?? undefined,
      location: node.fields.location ?? undefined,
      website: node.fields.website ?? undefined,
      startDate: node.fields.startDate ?? undefined,
      endDate: node.fields.endDate ?? undefined,
      description: node.fields.description ?? undefined,
      skills: node.fields.skills ?? undefined,
      visibility: node.meta.visibility,
      children: node.children.length ? serializeNormalized(node.children, node.legacyId) : undefined
    }

    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key]
      }
    })

    return payload
  })
}

main().catch((err) => {
  console.error("[content-items] Migration failed:")
  console.error(err)
  process.exit(1)
})
