import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  ContentItem,
  ContentItemVisibility,
  CreateContentItemData,
  UpdateContentItemData,
  ListContentItemsOptions
} from '@shared/types'
import { getDb } from '../../db/sqlite'

export class ContentItemNotFoundError extends Error {
  constructor(message = 'Content item not found') {
    super(message)
    this.name = 'ContentItemNotFoundError'
  }
}

export class ContentItemInvalidParentError extends Error {
  constructor(message = 'Invalid content item parent') {
    super(message)
    this.name = 'ContentItemInvalidParentError'
  }
}

type ContentItemRow = {
  id: string
  user_id: string
  parent_id: string | null
  order_index: number
  title: string | null
  role: string | null
  location: string | null
  website: string | null
  start_date: string | null
  end_date: string | null
  description: string | null
  skills: string | null
  visibility: ContentItemVisibility
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

function parseRow(row: ContentItemRow): ContentItem {
  return {
    id: row.id,
    userId: row.user_id,
    parentId: row.parent_id,
    order: row.order_index,
    title: row.title,
    role: row.role,
    location: row.location,
    website: row.website,
    startDate: row.start_date,
    endDate: row.end_date,
    description: row.description,
    skills: row.skills ? (JSON.parse(row.skills) as string[]) : undefined,
    visibility: row.visibility,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    createdBy: row.created_by,
    updatedBy: row.updated_by
  }
}

export class ContentItemRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  list(options: ListContentItemsOptions = {}): ContentItem[] {
    let sql = 'SELECT * FROM content_items WHERE 1 = 1'
    const params: Array<string | number | null> = []

    if (options.userId) {
      sql += ' AND user_id = ?'
      params.push(options.userId)
    }

    if (options.parentId === null) {
      sql += ' AND parent_id IS NULL'
    } else if (options.parentId) {
      sql += ' AND parent_id = ?'
      params.push(options.parentId)
    }

    if (options.visibility) {
      sql += ' AND visibility = ?'
      params.push(options.visibility)
    } else if (!options.includeDrafts) {
      sql += ` AND visibility != 'draft'`
    }

    sql += ' ORDER BY parent_id IS NOT NULL, parent_id, order_index ASC'

    if (typeof options.limit === 'number') {
      sql += ' LIMIT ?'
      params.push(options.limit)
    }

    if (typeof options.offset === 'number') {
      sql += ' OFFSET ?'
      params.push(options.offset)
    }

    const rows = this.db.prepare(sql).all(...params) as ContentItemRow[]
    return rows.map(parseRow)
  }

  getById(id: string): ContentItem | null {
    const row = this.db.prepare('SELECT * FROM content_items WHERE id = ?').get(id) as ContentItemRow | undefined
    if (!row) return null
    return parseRow(row)
  }

  create(data: CreateContentItemData & { userEmail: string }): ContentItem {
    const id = randomUUID()
    const now = new Date().toISOString()
    const parentId = data.parentId ?? null
    const order = data.order ?? this.nextOrderIndex(data.userId, parentId)
    const stmt = this.db.prepare(
      `
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )

    stmt.run(
      id,
      data.userId,
      parentId,
      order,
      data.title ?? null,
      data.role ?? null,
      data.location ?? null,
      data.website ?? null,
      data.startDate ?? null,
      data.endDate ?? null,
      data.description ?? null,
      data.skills ? JSON.stringify(data.skills) : null,
      data.visibility ?? 'draft',
      now,
      now,
      data.userEmail,
      data.userEmail
    )

    return this.getById(id) as ContentItem
  }

  update(id: string, data: UpdateContentItemData & { userEmail: string }): ContentItem {
    const existing = this.getById(id)
    if (!existing) {
      throw new Error(`Content item not found: ${id}`)
    }

    const parentId = data.parentId ?? existing.parentId
    const order =
      data.order ?? existing.order ?? this.nextOrderIndex(existing.userId, parentId ?? null)
    const now = new Date().toISOString()

    const stmt = this.db.prepare(
      `
      UPDATE content_items
      SET
        parent_id = ?,
        order_index = ?,
        title = ?,
        role = ?,
        location = ?,
        website = ?,
        start_date = ?,
        end_date = ?,
        description = ?,
        skills = ?,
        visibility = ?,
        updated_at = ?,
        updated_by = ?
      WHERE id = ?
    `
    )

    stmt.run(
      parentId ?? null,
      order,
      data.title ?? existing.title ?? null,
      data.role ?? existing.role ?? null,
      data.location ?? existing.location ?? null,
      data.website ?? existing.website ?? null,
      data.startDate ?? existing.startDate ?? null,
      data.endDate ?? existing.endDate ?? null,
      data.description ?? existing.description ?? null,
      data.skills ? JSON.stringify(data.skills) : existing.skills ? JSON.stringify(existing.skills) : null,
      data.visibility ?? existing.visibility ?? 'draft',
      now,
      data.userEmail,
      id
    )

    return this.getById(id) as ContentItem
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM content_items WHERE id = ?').run(id)
    if (result.changes === 0) {
      throw new ContentItemNotFoundError(`Content item not found: ${id}`)
    }
  }

  private nextOrderIndex(userId: string, parentId: string | null): number {
    const stmt =
      parentId === null
        ? this.db.prepare(
            'SELECT COALESCE(MAX(order_index), -1) + 1 AS nextIndex FROM content_items WHERE user_id = ? AND parent_id IS NULL'
          )
        : this.db.prepare(
            'SELECT COALESCE(MAX(order_index), -1) + 1 AS nextIndex FROM content_items WHERE user_id = ? AND parent_id = ?'
          )

    const row = (parentId === null
      ? stmt.get(userId)
      : stmt.get(userId, parentId)) as { nextIndex: number | null } | undefined
    return (row?.nextIndex ?? 0) as number
  }

  reorder(id: string, parentId: string | null, orderIndex: number, userEmail: string): ContentItem {
    const existing = this.getById(id)
    if (!existing) throw new ContentItemNotFoundError(`Content item not found: ${id}`)

    const targetParent = parentId ?? null
    if (targetParent) {
      const parent = this.getById(targetParent)
      if (!parent) throw new ContentItemInvalidParentError('Parent item not found')
      if (parent.userId !== existing.userId) {
        throw new ContentItemInvalidParentError('Parent item belongs to a different user')
      }
    }

    const tx = this.db.transaction(() => {
      this.resequenceSiblings(existing.userId, existing.parentId, id)

      const targetSiblings = this.fetchSiblingIds(existing.userId, targetParent).filter(
        (siblingId) => siblingId !== id
      )
      const clampedIndex = Math.max(0, Math.min(orderIndex, targetSiblings.length))
      targetSiblings.splice(clampedIndex, 0, id)
      this.assignOrderForIds(targetSiblings)

      const now = new Date().toISOString()
      this.db
        .prepare(
          `
        UPDATE content_items
        SET parent_id = ?, updated_at = ?, updated_by = ?
        WHERE id = ?
      `
        )
        .run(targetParent, now, userEmail, id)
    })

    tx()
    return this.getById(id) as ContentItem
  }

  private resequenceSiblings(userId: string, parentId: string | null | undefined, excludeId: string): void {
    const ids = this.fetchSiblingIds(userId, parentId ?? null).filter((siblingId) => siblingId !== excludeId)
    this.assignOrderForIds(ids)
  }

  private fetchSiblingIds(userId: string, parentId: string | null): string[] {
    const stmt =
      parentId === null
        ? this.db.prepare(
            'SELECT id FROM content_items WHERE user_id = ? AND parent_id IS NULL ORDER BY order_index ASC'
          )
        : this.db.prepare(
            'SELECT id FROM content_items WHERE user_id = ? AND parent_id = ? ORDER BY order_index ASC'
          )
    const rows =
      parentId === null
        ? (stmt.all(userId) as Array<{ id: string }>)
        : (stmt.all(userId, parentId) as Array<{ id: string }>)
    return rows.map((row) => row.id)
  }

  private assignOrderForIds(ids: string[]): void {
    const stmt = this.db.prepare('UPDATE content_items SET order_index = ? WHERE id = ?')
    ids.forEach((siblingId, idx) => {
      stmt.run(idx, siblingId)
    })
  }
}
