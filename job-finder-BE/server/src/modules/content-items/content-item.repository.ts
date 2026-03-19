import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { ContentItem, CreateContentItemData, UpdateContentItemData, ListContentItemsOptions } from '@shared/types'
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
  ai_context: string | null
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
}

function parseRow(row: ContentItemRow): ContentItem {
  return {
    id: row.id,
    parentId: row.parent_id,
    orderIndex: row.order_index,
    title: row.title,
    role: row.role,
    location: row.location,
    website: row.website,
    startDate: row.start_date,
    endDate: row.end_date,
    description: row.description,
    skills: row.skills ? (JSON.parse(row.skills) as string[]) : undefined,
    aiContext: row.ai_context as ContentItem['aiContext'],
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

  list(userId: string, options: ListContentItemsOptions = {}): ContentItem[] {
    const { whereClause, params } = this.buildFilters(userId, options)
    let sql = `SELECT * FROM content_items ${whereClause} ORDER BY parent_id IS NOT NULL, parent_id, order_index ASC`

    const paginatedParams = [...params]
    if (typeof options.limit === 'number') {
      sql += ' LIMIT ?'
      paginatedParams.push(options.limit)
    }

    if (typeof options.offset === 'number') {
      sql += ' OFFSET ?'
      paginatedParams.push(options.offset)
    }

    const rows = this.db.prepare(sql).all(...paginatedParams) as ContentItemRow[]
    return rows.map(parseRow)
  }

  count(userId: string, options: ListContentItemsOptions = {}): number {
    const { whereClause, params } = this.buildFilters(userId, options)
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM content_items ${whereClause}`)
      .get(...params) as { count: number }
    return row.count
  }

  getById(userId: string, id: string): ContentItem | null {
    const row = this.db.prepare('SELECT * FROM content_items WHERE id = ? AND user_id = ?').get(id, userId) as ContentItemRow | undefined
    if (!row) return null
    return parseRow(row)
  }

  create(userId: string, data: CreateContentItemData & { userEmail: string }): ContentItem {
    const id = randomUUID()
    const now = new Date().toISOString()
    const parentId = data.parentId ?? null
    const order = data.orderIndex ?? this.nextOrderIndex(userId, parentId)
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
        ai_context,
        created_at,
        updated_at,
        created_by,
        updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    )

    stmt.run(
      id,
      userId,
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
      data.aiContext ?? null,
      now,
      now,
      data.userEmail,
      data.userEmail
    )

    return this.getById(userId, id) as ContentItem
  }

  update(userId: string, id: string, data: UpdateContentItemData & { userEmail: string }): ContentItem {
    const existing = this.getById(userId, id)
    if (!existing) throw new ContentItemNotFoundError(`Content item not found: ${id}`)

    const parentId = data.parentId ?? existing.parentId
    const order = data.orderIndex ?? existing.orderIndex ?? this.nextOrderIndex(userId, parentId ?? null)
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
        ai_context = ?,
        updated_at = ?,
        updated_by = ?
      WHERE id = ? AND user_id = ?
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
      data.aiContext !== undefined ? data.aiContext : existing.aiContext ?? null,
      now,
      data.userEmail,
      id,
      userId
    )

    return this.getById(userId, id) as ContentItem
  }

  delete(userId: string, id: string): void {
    const result = this.db.prepare('DELETE FROM content_items WHERE id = ? AND user_id = ?').run(id, userId)
    if (result.changes === 0) {
      throw new ContentItemNotFoundError(`Content item not found: ${id}`)
    }
  }

  private nextOrderIndex(userId: string, parentId: string | null): number {
    const stmt =
      parentId === null
        ? this.db.prepare(
            'SELECT COALESCE(MAX(order_index), -1) + 1 AS nextIndex FROM content_items WHERE parent_id IS NULL AND user_id = ?'
          )
        : this.db.prepare(
            'SELECT COALESCE(MAX(order_index), -1) + 1 AS nextIndex FROM content_items WHERE parent_id = ? AND user_id = ?'
          )

    const row = (parentId === null ? stmt.get(userId) : stmt.get(parentId, userId)) as { nextIndex: number | null } | undefined
    return (row?.nextIndex ?? 0) as number
  }

  reorder(userId: string, id: string, parentId: string | null, orderIndex: number, userEmail: string): ContentItem {
    const existing = this.getById(userId, id)
    if (!existing) throw new ContentItemNotFoundError(`Content item not found: ${id}`)

    const targetParent = parentId ?? null
    if (targetParent) {
      const parent = this.getById(userId, targetParent)
      if (!parent) throw new ContentItemInvalidParentError('Parent item not found')
    }

    const tx = this.db.transaction(() => {
      this.resequenceSiblings(userId, existing.parentId, id)

      const targetSiblings = this.fetchSiblingIds(userId, targetParent).filter(
        (siblingId) => siblingId !== id
      )
      const clampedIndex = Math.max(0, Math.min(orderIndex, targetSiblings.length))
      targetSiblings.splice(clampedIndex, 0, id)
      this.assignOrderForIds(userId, targetSiblings)

      const now = new Date().toISOString()
      this.db
        .prepare(
          `
        UPDATE content_items
        SET parent_id = ?, updated_at = ?, updated_by = ?
        WHERE id = ? AND user_id = ?
      `
        )
        .run(targetParent, now, userEmail, id, userId)
    })

    tx()
    return this.getById(userId, id) as ContentItem
  }

  private resequenceSiblings(userId: string, parentId: string | null | undefined, excludeId: string): void {
    const ids = this.fetchSiblingIds(userId, parentId ?? null).filter((siblingId) => siblingId !== excludeId)
    this.assignOrderForIds(userId, ids)
  }

  private fetchSiblingIds(userId: string, parentId: string | null): string[] {
    const stmt =
      parentId === null
        ? this.db.prepare('SELECT id FROM content_items WHERE parent_id IS NULL AND user_id = ? ORDER BY order_index ASC')
        : this.db.prepare('SELECT id FROM content_items WHERE parent_id = ? AND user_id = ? ORDER BY order_index ASC')
    const rows = parentId === null ? (stmt.all(userId) as Array<{ id: string }>) : (stmt.all(parentId, userId) as Array<{ id: string }>)
    return rows.map((row) => row.id)
  }

  private assignOrderForIds(userId: string, ids: string[]): void {
    const stmt = this.db.prepare('UPDATE content_items SET order_index = ? WHERE id = ? AND user_id = ?')
    ids.forEach((siblingId, idx) => {
      stmt.run(idx, siblingId, userId)
    })
  }

  private buildFilters(userId: string, options: ListContentItemsOptions) {
    let whereClause = 'WHERE user_id = ?'
    const params: Array<string | number | null> = [userId]

    if (options.parentId === null) {
      whereClause += ' AND parent_id IS NULL'
    } else if (options.parentId) {
      whereClause += ' AND parent_id = ?'
      params.push(options.parentId)
    }

    return { whereClause, params }
  }
}
