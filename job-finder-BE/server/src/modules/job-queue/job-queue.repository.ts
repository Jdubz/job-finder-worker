import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type {
  QueueItem,
  QueueStats,
  QueueStatus,
  QueueSource,
  SourceTier
} from '@shared/types'
import { getDb } from '../../db/sqlite'

type TimestampInput = QueueItem['created_at'] | string | null | undefined

type QueueItemRow = {
  id: string
  type: QueueItem['type']
  status: QueueStatus
  url: string
  company_name: string
  source: QueueSource
  submitted_by: string | null
  company_id: string | null
  metadata: string | null
  scrape_config: string | null
  scraped_data: string | null
  source_discovery_config: string | null
  pipeline_state: string | null
  parent_item_id: string | null
  source_id: string | null
  source_type: string | null
  source_config: string | null
  source_tier: SourceTier | null
  tracking_id: string | null
  created_at: string
  updated_at: string
  processed_at: string | null
  completed_at: string | null
  result_message: string | null
  error_details: string | null
}

export type NewQueueItem = Omit<QueueItem, 'id' | 'created_at' | 'updated_at'> & {
  created_at?: TimestampInput
  updated_at?: TimestampInput
}

export type QueueItemUpdate = Partial<Omit<QueueItem, 'id' | 'created_at' | 'updated_at'>> & {
  updated_at?: TimestampInput
}

const toISOString = (value: TimestampInput): string | null => {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return new Date(value).toISOString()
  if ('toDate' in value) return value.toDate().toISOString()
  return null
}

const parseTimestamp = (value: string | null): Date | undefined => {
  if (!value) return undefined
  return new Date(value)
}

const parseJson = <T>(value: string | null): T | undefined => {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

const serializeJson = (value: unknown): string | null => {
  if (value === undefined || value === null) return null
  return JSON.stringify(value)
}

const buildQueueItem = (row: QueueItemRow): QueueItem => {
  const item: QueueItem = {
    id: row.id,
    type: row.type,
    status: row.status,
    url: row.url,
    company_name: row.company_name,
    company_id: row.company_id,
    source: row.source,
    submitted_by: row.submitted_by,
    result_message: row.result_message ?? undefined,
    error_details: row.error_details ?? undefined,
    created_at: parseTimestamp(row.created_at) ?? new Date(),
    updated_at: parseTimestamp(row.updated_at) ?? new Date(),
    processed_at: parseTimestamp(row.processed_at) ?? undefined,
    completed_at: parseTimestamp(row.completed_at) ?? undefined,
    metadata: parseJson(row.metadata) ?? undefined,
    scrape_config: parseJson(row.scrape_config) ?? undefined,
    scraped_data: parseJson(row.scraped_data) ?? undefined,
    source_discovery_config: parseJson(row.source_discovery_config) ?? undefined,
    pipeline_state: parseJson(row.pipeline_state) ?? undefined,
    parent_item_id: row.parent_item_id ?? undefined,
    source_id: row.source_id ?? undefined,
    source_type: row.source_type ?? undefined,
    source_config: parseJson(row.source_config) ?? undefined,
    source_tier: row.source_tier ?? undefined,
    tracking_id: row.tracking_id && row.tracking_id.length > 0 ? row.tracking_id : undefined
  }

  return item
}

export class JobQueueRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  enqueue(data: NewQueueItem): QueueItem {
    const id = randomUUID()
    const trackingId = data.tracking_id ?? id
    const now = new Date().toISOString()

    const createdAt = toISOString(data.created_at) ?? now
    const updatedAt = toISOString(data.updated_at) ?? now
    const processedAt = toISOString(data.processed_at) ?? null
    const completedAt = toISOString(data.completed_at) ?? null

    const stmt = this.db.prepare(`
      INSERT INTO job_queue (
        id, type, status, url, company_name, source,
        submitted_by, company_id, metadata, scrape_config, scraped_data,
        source_discovery_config, pipeline_state, parent_item_id,
        source_id, source_type, source_config, source_tier,
        tracking_id, created_at, updated_at, processed_at, completed_at,
        result_message, error_details
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?
      )
    `)

    stmt.run(
      id,
      data.type,
      data.status,
      data.url,
      data.company_name,
      data.source,
      data.submitted_by ?? null,
      data.company_id ?? null,
      serializeJson(data.metadata),
      serializeJson(data.scrape_config),
      serializeJson(data.scraped_data),
      serializeJson(data.source_discovery_config),
      serializeJson(data.pipeline_state),
      data.parent_item_id ?? null,
      data.source_id ?? null,
      data.source_type ?? null,
      serializeJson(data.source_config),
      data.source_tier ?? null,
      trackingId,
      createdAt,
      updatedAt,
      processedAt,
      completedAt,
      data.result_message ?? null,
      data.error_details ?? null
    )

    return this.getById(id) as QueueItem
  }

  getById(id: string): QueueItem | null {
    const row = this.db.prepare('SELECT * FROM job_queue WHERE id = ?').get(id) as QueueItemRow | undefined
    return row ? buildQueueItem(row) : null
  }

  listByStatus(status: QueueStatus, limit = 50): QueueItem[] {
    const rows = this.db
      .prepare('SELECT * FROM job_queue WHERE status = ? ORDER BY created_at ASC LIMIT ?')
      .all(status, limit) as QueueItemRow[]
    return rows.map(buildQueueItem)
  }

  list(options: {
    status?: QueueStatus | QueueStatus[]
    type?: QueueItem['type']
    source?: QueueSource
    limit?: number
    offset?: number
  } = {}): QueueItem[] {
    let sql = 'SELECT * FROM job_queue WHERE 1 = 1'
    const params: Array<string | number> = []

    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status]
      const placeholders = statuses.map(() => '?').join(', ')
      sql += ` AND status IN (${placeholders})`
      params.push(...statuses)
    }

    if (options.type) {
      sql += ' AND type = ?'
      params.push(options.type)
    }

    if (options.source) {
      sql += ' AND source = ?'
      params.push(options.source)
    }

    sql += ' ORDER BY datetime(created_at) DESC'

    if (typeof options.limit === 'number') {
      sql += ' LIMIT ?'
      params.push(options.limit)
    }

    if (typeof options.offset === 'number') {
      sql += ' OFFSET ?'
      params.push(options.offset)
    }

    const rows = this.db.prepare(sql).all(...params) as QueueItemRow[]
    return rows.map(buildQueueItem)
  }

  update(id: string, updates: QueueItemUpdate): QueueItem {
    const existing = this.getById(id)
    if (!existing) {
      throw new Error(`Queue item not found: ${id}`)
    }

    const nextUpdatedAt = toISOString(updates.updated_at) ?? new Date().toISOString()

    const fields: string[] = []
    const values: Array<string | number | null> = []

    const assign = (column: string, value: unknown) => {
      fields.push(`${column} = ?`)
      values.push(value as string | number | null)
    }

    if (updates.status) assign('status', updates.status)
    if (updates.result_message !== undefined) assign('result_message', updates.result_message ?? null)
    if (updates.error_details !== undefined) assign('error_details', updates.error_details ?? null)
    if (updates.processed_at !== undefined) assign('processed_at', toISOString(updates.processed_at) ?? null)
    if (updates.completed_at !== undefined) assign('completed_at', toISOString(updates.completed_at) ?? null)
    if (updates.metadata !== undefined) assign('metadata', serializeJson(updates.metadata))
    if (updates.scrape_config !== undefined) assign('scrape_config', serializeJson(updates.scrape_config))
    if (updates.scraped_data !== undefined) assign('scraped_data', serializeJson(updates.scraped_data))
    if (updates.source_discovery_config !== undefined)
      assign('source_discovery_config', serializeJson(updates.source_discovery_config))
    if (updates.pipeline_state !== undefined) assign('pipeline_state', serializeJson(updates.pipeline_state))
    if (updates.parent_item_id !== undefined) assign('parent_item_id', updates.parent_item_id ?? null)
    if (updates.company_id !== undefined) assign('company_id', updates.company_id ?? null)
    if (updates.submitted_by !== undefined) assign('submitted_by', updates.submitted_by ?? null)
    if (updates.source_id !== undefined) assign('source_id', updates.source_id ?? null)
    if (updates.source_type !== undefined) assign('source_type', updates.source_type ?? null)
    if (updates.source_config !== undefined) assign('source_config', serializeJson(updates.source_config))
    if (updates.source_tier !== undefined) assign('source_tier', updates.source_tier ?? null)
    if (updates.tracking_id !== undefined) assign('tracking_id', updates.tracking_id ?? null)

    assign('updated_at', nextUpdatedAt)

    const sql = `UPDATE job_queue SET ${fields.join(', ')} WHERE id = ?`
    this.db.prepare(sql).run(...values, id)

    return this.getById(id) as QueueItem
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM job_queue WHERE id = ?').run(id)
  }

  getStats(): QueueStats {
    const rows = this.db.prepare('SELECT status, COUNT(*) as count FROM job_queue GROUP BY status').all() as Array<{
      status: QueueStatus
      count: number
    }>

    const stats: QueueStats = {
      pending: 0,
      processing: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      filtered: 0,
      needs_review: 0,
      total: 0
    }

    rows.forEach((row) => {
      switch (row.status) {
        case 'pending':
          stats.pending = row.count
          break
        case 'processing':
          stats.processing = row.count
          break
        case 'success':
          stats.success = row.count
          break
        case 'failed':
          stats.failed = row.count
          break
        case 'skipped':
          stats.skipped = row.count
          break
        case 'filtered':
          stats.filtered = row.count
          break
        case 'needs_review':
          stats.needs_review = row.count
          break
        default:
          break
      }
      stats.total += row.count
    })

    return stats
  }
}
