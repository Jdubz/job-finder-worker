import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { JobSource, JobSourceStatus, JobSourceHealth, TimestampLike } from '@shared/types'
import { getDb } from '../../db/sqlite'

type JobSourceRow = {
  id: string
  name: string
  source_type: string
  status: string
  config_json: string
  tags: string | null
  company_id: string | null
  company_name: string | null
  last_scraped_at: string | null
  last_scraped_status: string | null
  last_scraped_error: string | null
  consecutive_failures: number
  discovery_confidence: string | null
  discovered_via: string | null
  discovered_by: string | null
  discovery_queue_item_id: string | null
  health_json: string | null
  created_at: string
  updated_at: string
}

const parseTimestamp = (value: string | null): Date | null => {
  if (!value) return null
  return new Date(value)
}

const parseJsonArray = (value: string | null): string[] | null => {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as string[]) : null
  } catch {
    return null
  }
}

const parseJsonObject = <T>(value: string | null): T | null => {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const buildJobSource = (row: JobSourceRow): JobSource => ({
  id: row.id,
  name: row.name,
  sourceType: row.source_type,
  status: row.status as JobSourceStatus,
  configJson: parseJsonObject<Record<string, unknown>>(row.config_json) ?? {},
  tags: parseJsonArray(row.tags),
  companyId: row.company_id,
  companyName: row.company_name,
  lastScrapedAt: parseTimestamp(row.last_scraped_at),
  lastScrapedStatus: row.last_scraped_status,
  lastScrapedError: row.last_scraped_error,
  consecutiveFailures: row.consecutive_failures,
  discoveryConfidence: row.discovery_confidence as JobSource['discoveryConfidence'],
  discoveredVia: row.discovered_via,
  discoveredBy: row.discovered_by,
  discoveryQueueItemId: row.discovery_queue_item_id,
  health: parseJsonObject<JobSourceHealth>(row.health_json),
  createdAt: parseTimestamp(row.created_at) ?? new Date(),
  updatedAt: parseTimestamp(row.updated_at) ?? new Date()
})

export type CreateJobSourceInput = Omit<JobSource, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
export type UpdateJobSourceInput = Partial<Omit<JobSource, 'id' | 'createdAt' | 'updatedAt'>>

const toIsoString = (value: TimestampLike | string | Date | null | undefined): string | null => {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return new Date(value).toISOString()
  if ('toDate' in value) return value.toDate().toISOString()
  return null
}

export interface JobSourceListOptions {
  limit?: number
  offset?: number
  status?: JobSourceStatus
  sourceType?: string
  companyId?: string
  search?: string
  sortBy?: 'name' | 'created_at' | 'updated_at' | 'last_scraped_at'
  sortOrder?: 'asc' | 'desc'
}

export class JobSourceRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  list(options: JobSourceListOptions = {}): { items: JobSource[]; total: number } {
    const {
      limit = 50,
      offset = 0,
      status,
      sourceType,
      companyId,
      search,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = options

    const conditions: string[] = []
    const params: unknown[] = []

    if (status) {
      conditions.push('status = ?')
      params.push(status)
    }

    if (sourceType) {
      conditions.push('source_type = ?')
      params.push(sourceType)
    }

    if (companyId) {
      conditions.push('company_id = ?')
      params.push(companyId)
    }

    if (search) {
      conditions.push('(LOWER(name) LIKE ? OR LOWER(company_name) LIKE ?)')
      const searchTerm = `%${search.toLowerCase()}%`
      params.push(searchTerm, searchTerm)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    // Map sortBy to actual columns
    const sortColumnMap: Record<string, string> = {
      name: 'name',
      created_at: 'created_at',
      updated_at: 'updated_at',
      last_scraped_at: 'last_scraped_at'
    }
    const orderColumn = sortColumnMap[sortBy] ?? 'created_at'
    const orderDirection = (sortOrder || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    // Get total count
    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM job_sources ${whereClause}`)
      .get(...params) as { count: number }
    const total = countRow.count

    // Get paginated results
    const rows = this.db
      .prepare(
        `SELECT * FROM job_sources ${whereClause} ORDER BY ${orderColumn} ${orderDirection} LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as JobSourceRow[]

    return {
      items: rows.map(buildJobSource),
      total
    }
  }

  getById(id: string): JobSource | null {
    const row = this.db.prepare('SELECT * FROM job_sources WHERE id = ?').get(id) as
      | JobSourceRow
      | undefined
    return row ? buildJobSource(row) : null
  }

  create(input: CreateJobSourceInput): JobSource {
    const id = input.id ?? randomUUID()
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO job_sources (
        id, name, source_type, status, config_json, tags, company_id, company_name,
        last_scraped_at, last_scraped_status, last_scraped_error, consecutive_failures,
        discovery_confidence, discovered_via, discovered_by, discovery_queue_item_id,
        health_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      input.name,
      input.sourceType,
      input.status,
      JSON.stringify(input.configJson),
      input.tags ? JSON.stringify(input.tags) : null,
      input.companyId ?? null,
      input.companyName ?? null,
      toIsoString(input.lastScrapedAt),
      input.lastScrapedStatus ?? null,
      input.lastScrapedError ?? null,
      input.consecutiveFailures ?? 0,
      input.discoveryConfidence ?? null,
      input.discoveredVia ?? null,
      input.discoveredBy ?? null,
      input.discoveryQueueItemId ?? null,
      input.health ? JSON.stringify(input.health) : null,
      now,
      now
    )

    return this.getById(id) as JobSource
  }

  update(id: string, updates: UpdateJobSourceInput): JobSource | null {
    const existing = this.getById(id)
    if (!existing) return null

    const now = new Date().toISOString()
    const setClauses: string[] = ['updated_at = ?']
    const params: unknown[] = [now]

    if (updates.name !== undefined) {
      setClauses.push('name = ?')
      params.push(updates.name)
    }

    if (updates.sourceType !== undefined) {
      setClauses.push('source_type = ?')
      params.push(updates.sourceType)
    }

    if (updates.status !== undefined) {
      setClauses.push('status = ?')
      params.push(updates.status)
    }

    if (updates.configJson !== undefined) {
      setClauses.push('config_json = ?')
      params.push(JSON.stringify(updates.configJson))
    }

    if (updates.tags !== undefined) {
      setClauses.push('tags = ?')
      params.push(updates.tags ? JSON.stringify(updates.tags) : null)
    }

    if (updates.companyId !== undefined) {
      setClauses.push('company_id = ?')
      params.push(updates.companyId)
    }

    if (updates.companyName !== undefined) {
      setClauses.push('company_name = ?')
      params.push(updates.companyName)
    }

    if (updates.lastScrapedAt !== undefined) {
      setClauses.push('last_scraped_at = ?')
      params.push(toIsoString(updates.lastScrapedAt))
    }

    if (updates.lastScrapedStatus !== undefined) {
      setClauses.push('last_scraped_status = ?')
      params.push(updates.lastScrapedStatus)
    }

    if (updates.lastScrapedError !== undefined) {
      setClauses.push('last_scraped_error = ?')
      params.push(updates.lastScrapedError)
    }

    if (updates.consecutiveFailures !== undefined) {
      setClauses.push('consecutive_failures = ?')
      params.push(updates.consecutiveFailures)
    }

    if (updates.discoveryConfidence !== undefined) {
      setClauses.push('discovery_confidence = ?')
      params.push(updates.discoveryConfidence)
    }

    if (updates.discoveredVia !== undefined) {
      setClauses.push('discovered_via = ?')
      params.push(updates.discoveredVia)
    }

    if (updates.discoveredBy !== undefined) {
      setClauses.push('discovered_by = ?')
      params.push(updates.discoveredBy)
    }

    if (updates.discoveryQueueItemId !== undefined) {
      setClauses.push('discovery_queue_item_id = ?')
      params.push(updates.discoveryQueueItemId)
    }

    if (updates.health !== undefined) {
      setClauses.push('health_json = ?')
      params.push(updates.health ? JSON.stringify(updates.health) : null)
    }

    params.push(id)
    this.db.prepare(`UPDATE job_sources SET ${setClauses.join(', ')} WHERE id = ?`).run(...params)

    return this.getById(id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM job_sources WHERE id = ?').run(id)
  }

  getStats(): {
    total: number
    byStatus: Record<string, number>
  } {
    const statusRows = this.db
      .prepare('SELECT status, COUNT(*) as count FROM job_sources GROUP BY status')
      .all() as Array<{ status: string; count: number }>

    const totalRow = this.db
      .prepare('SELECT COUNT(*) as total FROM job_sources')
      .get() as { total: number }

    const byStatus: Record<string, number> = {}
    for (const row of statusRows) {
      byStatus[row.status] = row.count
    }

    return {
      total: totalRow.total,
      byStatus
    }
  }
}
