import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { QueueItem, QueueStats, QueueStatus } from '@shared/types'
import { getDb } from '../../db/sqlite'

type TimestampInput = QueueItem['created_at'] | string | null | undefined

type QueueItemRow = {
  id: string
  type: QueueItem['type']
  status: QueueStatus
  url: string | null
  tracking_id: string | null
  parent_item_id: string | null
  input: string | null
  output: string | null
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
  const input = parseJson<Record<string, unknown>>(row.input) ?? {}
  const output = parseJson<Record<string, unknown>>(row.output) ?? {}

  return {
    id: row.id,
    type: row.type,
    status: row.status,
    url: row.url ?? undefined,
    tracking_id: row.tracking_id && row.tracking_id.length > 0 ? row.tracking_id : undefined,
    parent_item_id: row.parent_item_id ?? undefined,
    input,
    output,
    // Derived convenience fields for compatibility with existing UI/API consumers
    company_name: (input.company_name as string | undefined) ?? undefined,
    company_id: (input.company_id as string | undefined) ?? undefined,
    source: (input.source as any) ?? undefined,
    submitted_by: (input.submitted_by as string | undefined) ?? undefined,
    scrape_config: (input.scrape_config as any) ?? undefined,
    scraped_data: (output.scraped_data as any) ?? undefined,
    source_discovery_config: (input.source_discovery_config as any) ?? undefined,
    source_id: (input.source_id as string | undefined) ?? undefined,
    source_type: (input.source_type as string | undefined) ?? undefined,
    source_config: (input.source_config as any) ?? undefined,
    source_tier: (input.source_tier as any) ?? undefined,
    pipeline_state: (output.pipeline_state as any) ?? undefined,
    metadata: (input.metadata as any) ?? undefined,
    result_message: row.result_message ?? undefined,
    error_details: row.error_details ?? undefined,
    created_at: parseTimestamp(row.created_at) ?? new Date(),
    updated_at: parseTimestamp(row.updated_at) ?? new Date(),
    processed_at: parseTimestamp(row.processed_at) ?? undefined,
    completed_at: parseTimestamp(row.completed_at) ?? undefined
  }
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

    // Pack top-level convenience fields into input/output JSON columns
    // This ensures data set by the service is properly persisted
    const inputData: Record<string, unknown> = {
      ...(data.input ?? {}),
      ...(data.company_name !== undefined && { company_name: data.company_name }),
      ...(data.company_id !== undefined && { company_id: data.company_id }),
      ...(data.source !== undefined && { source: data.source }),
      ...(data.submitted_by !== undefined && { submitted_by: data.submitted_by }),
      ...(data.metadata !== undefined && { metadata: data.metadata }),
      ...(data.scrape_config !== undefined && { scrape_config: data.scrape_config }),
      ...(data.source_discovery_config !== undefined && { source_discovery_config: data.source_discovery_config }),
      ...(data.source_id !== undefined && { source_id: data.source_id }),
      ...(data.source_type !== undefined && { source_type: data.source_type }),
      ...(data.source_config !== undefined && { source_config: data.source_config }),
      ...(data.source_tier !== undefined && { source_tier: data.source_tier })
    }

    const outputData: Record<string, unknown> = {
      ...(data.output ?? {}),
      ...(data.scraped_data !== undefined && { scraped_data: data.scraped_data }),
      ...(data.pipeline_state !== undefined && { pipeline_state: data.pipeline_state })
    }

    const stmt = this.db.prepare(`
      INSERT INTO job_queue (
        id, type, status, url, tracking_id, parent_item_id,
        input, output, result_message, error_details,
        created_at, updated_at, processed_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      data.type,
      data.status,
      data.url ?? null,
      trackingId,
      data.parent_item_id ?? null,
      serializeJson(Object.keys(inputData).length ? inputData : null),
      serializeJson(Object.keys(outputData).length ? outputData : null),
      data.result_message ?? null,
      data.error_details ?? null,
      createdAt,
      updatedAt,
      processedAt,
      completedAt
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

    // Merge top-level convenience fields into input/output JSON columns
    const existingInput = existing.input ?? {}
    const nextInput: Record<string, unknown> = {
      ...existingInput,
      ...(updates.input ?? {}),
      ...(updates.company_name !== undefined && { company_name: updates.company_name }),
      ...(updates.company_id !== undefined && { company_id: updates.company_id }),
      ...(updates.source !== undefined && { source: updates.source }),
      ...(updates.submitted_by !== undefined && { submitted_by: updates.submitted_by }),
      ...(updates.metadata !== undefined && { metadata: updates.metadata }),
      ...(updates.scrape_config !== undefined && { scrape_config: updates.scrape_config }),
      ...(updates.source_discovery_config !== undefined && { source_discovery_config: updates.source_discovery_config }),
      ...(updates.source_id !== undefined && { source_id: updates.source_id }),
      ...(updates.source_type !== undefined && { source_type: updates.source_type }),
      ...(updates.source_config !== undefined && { source_config: updates.source_config }),
      ...(updates.source_tier !== undefined && { source_tier: updates.source_tier })
    }

    const existingOutput = existing.output ?? {}
    const nextOutput: Record<string, unknown> = {
      ...existingOutput,
      ...(updates.output ?? {}),
      ...(updates.scraped_data !== undefined && { scraped_data: updates.scraped_data }),
      ...(updates.pipeline_state !== undefined && { pipeline_state: updates.pipeline_state })
    }

    this.db
      .prepare(
        `UPDATE job_queue
         SET type = ?, status = ?, url = ?, tracking_id = ?, parent_item_id = ?,
             input = ?, output = ?, result_message = ?, error_details = ?,
             updated_at = ?, processed_at = ?, completed_at = ?
         WHERE id = ?`
      )
      .run(
        updates.type ?? existing.type,
        updates.status ?? existing.status,
        updates.url ?? existing.url ?? null,
        updates.tracking_id ?? existing.tracking_id ?? null,
        updates.parent_item_id ?? existing.parent_item_id ?? null,
        serializeJson(Object.keys(nextInput).length ? nextInput : null),
        serializeJson(Object.keys(nextOutput).length ? nextOutput : null),
        updates.result_message ?? existing.result_message ?? null,
        updates.error_details ?? existing.error_details ?? null,
        nextUpdatedAt,
        toISOString(updates.processed_at) ?? toISOString(existing.processed_at) ?? null,
        toISOString(updates.completed_at) ?? toISOString(existing.completed_at) ?? null,
        id
      )

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
        default:
          break
      }
      stats.total += row.count
    })

    return stats
  }
}
