import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  ResumeVersion,
  ResumeItem,
  TailoredResume,
  CreateResumeItemData,
  CreateResumeVersionData,
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

export class ResumeVersionAlreadyExistsError extends Error {
  constructor(slug: string) {
    super(`Resume version with slug "${slug}" already exists`)
    this.name = 'ResumeVersionAlreadyExistsError'
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

  createVersion(data: CreateResumeVersionData): ResumeVersion {
    const id = randomUUID()
    const now = new Date().toISOString()

    const existing = this.getVersionBySlug(data.slug)
    if (existing) {
      throw new ResumeVersionAlreadyExistsError(data.slug)
    }

    this.db
      .prepare(
        `INSERT INTO resume_versions (id, slug, name, description, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, data.slug, data.name, data.description ?? null, now, now)

    const newVersion = this.getVersionById(id)
    if (!newVersion) {
      throw new Error(`Failed to retrieve newly created resume version with id: ${id}`)
    }
    return newVersion
  }

  deleteVersion(slug: string): void {
    const version = this.getVersionBySlug(slug)
    if (!version) {
      throw new ResumeVersionNotFoundError(`Resume version not found: ${slug}`)
    }
    // CASCADE delete will remove all resume_items for this version
    this.db.prepare('DELETE FROM resume_versions WHERE slug = ?').run(slug)
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

  // ── Pool helpers ────────────────────────────────────────────────

  getPoolVersion(): ResumeVersion | null {
    return this.getVersionBySlug('pool')
  }

  // ── Tailored resume cache ──────────────────────────────────────

  getCachedTailoredResume(jobMatchId: string): TailoredResume | null {
    const row = this.db
      .prepare(
        `SELECT * FROM tailored_resumes
         WHERE job_match_id = ? AND datetime(expires_at) > datetime('now')`
      )
      .get(jobMatchId) as TailoredResumeRow | undefined
    return row ? parseTailoredRow(row) : null
  }

  saveTailoredResume(data: {
    jobMatchId: string
    resumeContent: unknown
    selectedItems: string[]
    pdfPath: string | null
    pdfSizeBytes: number | null
    contentFit: unknown | null
    reasoning: string | null
  }): TailoredResume {
    const id = randomUUID()
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days

    // Upsert: update in place if same job_match_id exists (preserves original id)
    this.db
      .prepare(
        `INSERT INTO tailored_resumes (
          id, job_match_id, resume_content, selected_items,
          pdf_path, pdf_size_bytes, content_fit, reasoning,
          created_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(job_match_id) DO UPDATE SET
          resume_content = excluded.resume_content,
          selected_items = excluded.selected_items,
          pdf_path = excluded.pdf_path,
          pdf_size_bytes = excluded.pdf_size_bytes,
          content_fit = excluded.content_fit,
          reasoning = excluded.reasoning,
          created_at = excluded.created_at,
          expires_at = excluded.expires_at`
      )
      .run(
        id,
        data.jobMatchId,
        JSON.stringify(data.resumeContent),
        JSON.stringify(data.selectedItems),
        data.pdfPath,
        data.pdfSizeBytes,
        data.contentFit ? JSON.stringify(data.contentFit) : null,
        data.reasoning,
        now,
        expiresAt
      )

    return this.getCachedTailoredResume(data.jobMatchId)!
  }

  invalidateAllTailoredResumes(): number {
    // Collect PDF paths before deletion so caller can clean up files
    const rows = this.db
      .prepare('SELECT pdf_path FROM tailored_resumes WHERE pdf_path IS NOT NULL')
      .all() as Array<{ pdf_path: string }>
    const result = this.db.prepare('DELETE FROM tailored_resumes').run()
    this._orphanedPdfPaths = rows.map((r) => r.pdf_path)
    return result.changes
  }

  /** PDF paths orphaned by the last invalidateAllTailoredResumes() call. */
  _orphanedPdfPaths: string[] = []

  getOrphanedPdfPaths(): string[] {
    const paths = this._orphanedPdfPaths
    this._orphanedPdfPaths = []
    return paths
  }

  getTailoredResumePdfPath(jobMatchId: string): string | null {
    const row = this.db
      .prepare('SELECT pdf_path FROM tailored_resumes WHERE job_match_id = ? AND datetime(expires_at) > datetime(\'now\')')
      .get(jobMatchId) as { pdf_path: string | null } | undefined
    return row?.pdf_path ?? null
  }
}

// ─── Tailored resume row types ───────────────────────────────────

type TailoredResumeRow = {
  id: string
  job_match_id: string
  resume_content: string
  selected_items: string
  pdf_path: string | null
  pdf_size_bytes: number | null
  content_fit: string | null
  reasoning: string | null
  created_at: string
  expires_at: string
}

function parseTailoredRow(row: TailoredResumeRow): TailoredResume {
  return {
    id: row.id,
    jobMatchId: row.job_match_id,
    resumeContent: JSON.parse(row.resume_content),
    selectedItems: JSON.parse(row.selected_items),
    pdfPath: row.pdf_path,
    pdfSizeBytes: row.pdf_size_bytes,
    contentFit: row.content_fit ? JSON.parse(row.content_fit) : null,
    reasoning: row.reasoning,
    createdAt: row.created_at,
    expiresAt: row.expires_at
  }
}
