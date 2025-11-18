import { randomUUID } from 'node:crypto'
import { getDb } from '../../db/sqlite'
import type Database from 'better-sqlite3'
import type {
  ContentItem,
  ContentItemType,
  ContentItemVisibility,
  CreateContentItemData,
  UpdateContentItemData,
  ListContentItemsOptions
} from '@shared/types'

type ContentItemRow = {
  id: string
  type: ContentItemType
  user_id: string
  parent_id: string | null
  order_index: number
  visibility: ContentItemVisibility | null
  created_at: string
  updated_at: string
  created_by: string
  updated_by: string
  tags: string | null
  ai_context: string | null
  body_json: string
}

function parseRow(row: ContentItemRow): ContentItem {
  const payload = row.body_json ? (JSON.parse(row.body_json) as Partial<ContentItem>) : {}
  const tags = row.tags ? (JSON.parse(row.tags) as string[]) : payload.tags
  const aiContext = row.ai_context ? JSON.parse(row.ai_context) : payload.aiContext

  return {
    ...payload,
    id: row.id,
    type: row.type,
    userId: payload.userId ?? row.user_id,
    parentId: payload.parentId ?? row.parent_id,
    order: payload.order ?? row.order_index,
    visibility: payload.visibility ?? row.visibility ?? undefined,
    tags,
    aiContext,
    createdAt: payload.createdAt ?? row.created_at,
    updatedAt: payload.updatedAt ?? row.updated_at,
    createdBy: payload.createdBy ?? row.created_by,
    updatedBy: payload.updatedBy ?? row.updated_by
  } as ContentItem
}

export class ContentItemRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  list(options: ListContentItemsOptions = {}): ContentItem[] {
    let sql = 'SELECT * FROM content_items WHERE 1 = 1'
    const params: Array<string | number> = []

    if (options.type) {
      sql += ' AND type = ?'
      params.push(options.type)
    }

    if (options.parentId !== undefined) {
      if (options.parentId === null) {
        sql += ' AND parent_id IS NULL'
      } else {
        sql += ' AND parent_id = ?'
        params.push(options.parentId)
      }
    }

    if (options.visibility) {
      sql += ' AND visibility = ?'
      params.push(options.visibility)
    }

    sql += ' ORDER BY order_index ASC'

    if (typeof options.limit === 'number') {
      sql += ' LIMIT ?'
      params.push(options.limit)
    }

    if (typeof options.offset === 'number') {
      sql += ' OFFSET ?'
      params.push(options.offset)
    }

    const rows = this.db.prepare(sql).all(...params) as ContentItemRow[]
    let items = rows.map(parseRow)

    if (options.tags?.length) {
      items = items.filter((item) => {
        if (!item.tags) return false
        return options.tags?.some((tag: string) => item.tags?.includes(tag)) ?? false
      })
    }

    return items
  }

  getById(id: string): ContentItem | null {
    const row = this.db.prepare('SELECT * FROM content_items WHERE id = ?').get(id) as ContentItemRow | undefined
    if (!row) return null
    return parseRow(row)
  }

  create(data: CreateContentItemData & { userId: string; userEmail: string }): ContentItem {
    const id = randomUUID()
    const now = new Date().toISOString()
    const baseParent = data.parentId ?? null
    const visibility = data.visibility ?? 'published'
    const { userEmail, ...payload } = data

    const stmt = this.db.prepare(`
      INSERT INTO content_items (
        id, type, user_id, parent_id, order_index, visibility,
        created_at, updated_at, created_by, updated_by,
        tags, ai_context, body_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.type,
      data.userId,
      baseParent,
      data.order ?? 0,
      visibility,
      now,
      now,
      userEmail,
      userEmail,
      data.tags ? JSON.stringify(data.tags) : null,
      data.aiContext ? JSON.stringify(data.aiContext) : null,
      JSON.stringify(payload)
    )

    return this.getById(id) as ContentItem
  }

  update(id: string, data: UpdateContentItemData & { userEmail: string }): ContentItem {
    const existing = this.getById(id)
    if (!existing) {
      throw new Error(`Content item not found: ${id}`)
    }

    const { userEmail, ...payload } = data
    const merged = { ...existing, ...payload, updatedBy: userEmail }
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      UPDATE content_items
      SET
        parent_id = ?,
        order_index = ?,
        visibility = ?,
        updated_at = ?,
        updated_by = ?,
        tags = ?,
        ai_context = ?,
        body_json = ?
      WHERE id = ?
    `)

    stmt.run(
      merged.parentId ?? null,
      merged.order ?? existing.order ?? 0,
      merged.visibility ?? existing.visibility ?? 'published',
      now,
      userEmail,
      merged.tags ? JSON.stringify(merged.tags) : null,
      merged.aiContext ? JSON.stringify(merged.aiContext) : null,
      JSON.stringify({ ...existing, ...payload }),
      id
    )

    return this.getById(id) as ContentItem
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM content_items WHERE id = ?').run(id)
  }
}
