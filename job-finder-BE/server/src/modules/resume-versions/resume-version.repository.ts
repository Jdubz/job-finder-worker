import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  ResumeVersion,
  ResumeItem,
  CreateResumeItemData,
  UpdateResumeItemData,
  ResumeVersionSlug
} from '@shared/types'
import { getDb } from '../../db/sqlite'

export class ResumeVersionNotFoundError extends Error {
  constructor(message = 'Resume version not found') {
    super(message)
    this.name = 'ResumeVersionNotFoundError'
  }
}

export class ResumeItemNotFoundError extends Error {
  constructor(message = 'Resume item not found') {
    super(message)
    this.name = 'ResumeItemNotFoundError'
  }
}

export class ResumeItemInvalidParentError extends Error {
  constructor(message = 'Invalid resume item parent') {
    super(message)
    this.name = 'ResumeItemInvalidParentError'
  }
}

// ─── Row types ───────────────────────────────────────────────────────

type VersionRow = {
  id: string
  slug: string
  name: string
  description: string | null
  pdf_path: string | null
  pdf_size_bytes: number | null
  published_at: string | null
  published_by: string | null
  created_at: string
  updated_at: string
}

type ItemRow = {
  id: string
  resume_version_id: string
  parent_id: string | null
  order_index: number
  ai_context: string | null
  title: string | null
  role: string | null
  location: string | null
  website: string | null
  start_date: string | null
  end_date: string | null
  description: string | null
  skills: string | null
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

// ─── Row parsers ─────────────────────────────────────────────────────

function parseVersionRow(row: VersionRow): ResumeVersion {
  return {
    id: row.id,
    slug: row.slug as ResumeVersionSlug,
    name: row.name,
    description: row.description,
    pdfPath: row.pdf_path,
    pdfSizeBytes: row.pdf_size_bytes,
    publishedAt: row.published_at ? new Date(row.published_at) : null,
    publishedBy: row.published_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }
}

function parseItemRow(row: ItemRow): ResumeItem {
  return {
    id: row.id,
    resumeVersionId: row.resume_version_id,
    parentId: row.parent_id,
    orderIndex: row.order_index,
    aiContext: row.ai_context as ResumeItem['aiContext'],
    title: row.title,
    role: row.role,
    location: row.location,
    website: row.website,
    startDate: row.start_date,
    endDate: row.end_date,
    description: row.description,
    skills: row.skills ? (JSON.parse(row.skills) as string[]) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by
  }
}

// ─── Repository ──────────────────────────────────────────────────────

export class ResumeVersionRepository {
  private db: Database.Database

  constructor(db?: Database.Database) {
    this.db = db ?? getDb()
  }

  // ── Version queries ──────────────────────────────────────────────

  listVersions(): ResumeVersion[] {
    const rows = this.db
      .prepare('SELECT * FROM resume_versions ORDER BY slug ASC')
      .all() as VersionRow[]
    return rows.map(parseVersionRow)
  }

  getVersionBySlug(slug: string): ResumeVersion | null {
    const row = this.db
      .prepare('SELECT * FROM resume_versions WHERE slug = ?')
      .get(slug) as VersionRow | undefined
    return row ? parseVersionRow(row) : null
  }

  getVersionById(id: string): ResumeVersion | null {
    const row = this.db
      .prepare('SELECT * FROM resume_versions WHERE id = ?')
      .get(id) as VersionRow | undefined
    return row ? parseVersionRow(row) : null
  }

  updateVersionPublish(slug: string, pdfPath: string, pdfSizeBytes: number, publishedBy: string): ResumeVersion {
    const now = new Date().toISOString()
    const result = this.db
      .prepare(
        `UPDATE resume_versions
         SET pdf_path = ?, pdf_size_bytes = ?, published_at = ?, published_by = ?, updated_at = ?
         WHERE slug = ?`
      )
      .run(pdfPath, pdfSizeBytes, now, publishedBy, now, slug)

    if (result.changes === 0) {
      throw new ResumeVersionNotFoundError(`Resume version not found: ${slug}`)
    }

    return this.getVersionBySlug(slug) as ResumeVersion
  }

  // ── Item queries ─────────────────────────────────────────────────

  listItems(resumeVersionId: string): ResumeItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM resume_items
         WHERE resume_version_id = ?
         ORDER BY parent_id IS NOT NULL, parent_id, order_index ASC`
      )
      .all(resumeVersionId) as ItemRow[]
    return rows.map(parseItemRow)
  }

  countItems(resumeVersionId: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM resume_items WHERE resume_version_id = ?')
      .get(resumeVersionId) as { count: number }
    return row.count
  }

  getItemById(id: string): ResumeItem | null {
    const row = this.db
      .prepare('SELECT * FROM resume_items WHERE id = ?')
      .get(id) as ItemRow | undefined
    return row ? parseItemRow(row) : null
  }

  createItem(resumeVersionId: string, data: CreateResumeItemData & { userEmail: string }): ResumeItem {
    const id = randomUUID()
    const now = new Date().toISOString()
    const parentId = data.parentId ?? null

    if (parentId) {
      const parent = this.getItemById(parentId)
      if (!parent) throw new ResumeItemInvalidParentError('Parent item not found')
      if (parent.resumeVersionId !== resumeVersionId) {
        throw new ResumeItemInvalidParentError('Parent belongs to a different resume version')
      }
    }

    const order = data.orderIndex ?? this.nextOrderIndex(resumeVersionId, parentId)

    this.db
      .prepare(
        `INSERT INTO resume_items (
          id, resume_version_id, parent_id, order_index, ai_context,
          title, role, location, website, start_date, end_date,
          description, skills, created_at, updated_at, created_by, updated_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        resumeVersionId,
        parentId,
        order,
        data.aiContext ?? null,
        data.title ?? null,
        data.role ?? null,
        data.location ?? null,
        data.website ?? null,
        data.startDate ?? null,
        data.endDate ?? null,
        data.description ?? null,
        data.skills ? JSON.stringify(data.skills) : null,
        now,
        now,
        data.userEmail,
        data.userEmail
      )

    return this.getItemById(id) as ResumeItem
  }

  updateItem(id: string, data: UpdateResumeItemData & { userEmail: string }): ResumeItem {
    const existing = this.getItemById(id)
    if (!existing) throw new ResumeItemNotFoundError(`Resume item not found: ${id}`)

    const now = new Date().toISOString()

    this.db
      .prepare(
        `UPDATE resume_items SET
          parent_id = ?, order_index = ?, ai_context = ?,
          title = ?, role = ?, location = ?, website = ?,
          start_date = ?, end_date = ?, description = ?, skills = ?,
          updated_at = ?, updated_by = ?
        WHERE id = ?`
      )
      .run(
        data.parentId !== undefined ? data.parentId : existing.parentId,
        data.orderIndex ?? existing.orderIndex,
        data.aiContext !== undefined ? data.aiContext : existing.aiContext ?? null,
        data.title !== undefined ? data.title : existing.title ?? null,
        data.role !== undefined ? data.role : existing.role ?? null,
        data.location !== undefined ? data.location : existing.location ?? null,
        data.website !== undefined ? data.website : existing.website ?? null,
        data.startDate !== undefined ? data.startDate : existing.startDate ?? null,
        data.endDate !== undefined ? data.endDate : existing.endDate ?? null,
        data.description !== undefined ? data.description : existing.description ?? null,
        data.skills !== undefined
          ? data.skills ? JSON.stringify(data.skills) : null
          : existing.skills ? JSON.stringify(existing.skills) : null,
        now,
        data.userEmail,
        id
      )

    return this.getItemById(id) as ResumeItem
  }

  deleteItem(id: string): void {
    const result = this.db.prepare('DELETE FROM resume_items WHERE id = ?').run(id)
    if (result.changes === 0) {
      throw new ResumeItemNotFoundError(`Resume item not found: ${id}`)
    }
  }

  reorderItem(id: string, parentId: string | null, orderIndex: number, userEmail: string): ResumeItem {
    const existing = this.getItemById(id)
    if (!existing) throw new ResumeItemNotFoundError(`Resume item not found: ${id}`)

    const targetParent = parentId ?? null
    if (targetParent) {
      const parent = this.getItemById(targetParent)
      if (!parent) throw new ResumeItemInvalidParentError('Parent item not found')
      if (parent.resumeVersionId !== existing.resumeVersionId) {
        throw new ResumeItemInvalidParentError('Parent belongs to a different resume version')
      }
    }

    const tx = this.db.transaction(() => {
      // Resequence old siblings (excluding this item)
      this.resequenceSiblings(existing.resumeVersionId, existing.parentId, id)

      // Place item in new position among target siblings
      const targetSiblings = this.fetchSiblingIds(existing.resumeVersionId, targetParent)
        .filter((siblingId) => siblingId !== id)
      const clampedIndex = Math.max(0, Math.min(orderIndex, targetSiblings.length))
      targetSiblings.splice(clampedIndex, 0, id)
      this.assignOrderForIds(targetSiblings)

      const now = new Date().toISOString()
      this.db
        .prepare('UPDATE resume_items SET parent_id = ?, updated_at = ?, updated_by = ? WHERE id = ?')
        .run(targetParent, now, userEmail, id)
    })

    tx()
    return this.getItemById(id) as ResumeItem
  }

  // ── Private helpers ──────────────────────────────────────────────

  private nextOrderIndex(resumeVersionId: string, parentId: string | null): number {
    const stmt =
      parentId === null
        ? this.db.prepare(
            'SELECT COALESCE(MAX(order_index), -1) + 1 AS nextIndex FROM resume_items WHERE resume_version_id = ? AND parent_id IS NULL'
          )
        : this.db.prepare(
            'SELECT COALESCE(MAX(order_index), -1) + 1 AS nextIndex FROM resume_items WHERE resume_version_id = ? AND parent_id = ?'
          )

    const row = (
      parentId === null ? stmt.get(resumeVersionId) : stmt.get(resumeVersionId, parentId)
    ) as { nextIndex: number | null } | undefined
    return (row?.nextIndex ?? 0) as number
  }

  private resequenceSiblings(resumeVersionId: string, parentId: string | null | undefined, excludeId: string): void {
    const ids = this.fetchSiblingIds(resumeVersionId, parentId ?? null).filter((sid) => sid !== excludeId)
    this.assignOrderForIds(ids)
  }

  private fetchSiblingIds(resumeVersionId: string, parentId: string | null): string[] {
    const stmt =
      parentId === null
        ? this.db.prepare(
            'SELECT id FROM resume_items WHERE resume_version_id = ? AND parent_id IS NULL ORDER BY order_index ASC'
          )
        : this.db.prepare(
            'SELECT id FROM resume_items WHERE resume_version_id = ? AND parent_id = ? ORDER BY order_index ASC'
          )
    const rows = (
      parentId === null ? stmt.all(resumeVersionId) : stmt.all(resumeVersionId, parentId)
    ) as Array<{ id: string }>
    return rows.map((r) => r.id)
  }

  private assignOrderForIds(ids: string[]): void {
    const stmt = this.db.prepare('UPDATE resume_items SET order_index = ? WHERE id = ?')
    ids.forEach((siblingId, idx) => {
      stmt.run(idx, siblingId)
    })
  }
}
