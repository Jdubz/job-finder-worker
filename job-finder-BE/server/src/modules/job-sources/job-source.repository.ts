import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { JobSource, JobSourceStatus, TimestampLike, SourceConfigJson } from '@shared/types'
import { getDb } from '../../db/sqlite'

type JobSourceRow = {
  id: string
  name: string
  source_type: string
  status: string
  config_json: string
  tags: string | null
  company_id: string | null
  aggregator_domain: string | null
  last_scraped_at: string | null
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
  configJson: parseJsonObject<SourceConfigJson>(row.config_json) ?? {} as SourceConfigJson,
  tags: parseJsonArray(row.tags),
  companyId: row.company_id,
  aggregatorDomain: row.aggregator_domain,
  lastScrapedAt: parseTimestamp(row.last_scraped_at),
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
      sortBy = 'updated_at',
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
      conditions.push('LOWER(name) LIKE ?')
      const searchTerm = `%${search.toLowerCase()}%`
      params.push(searchTerm)
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
        id, name, source_type, status, config_json, tags, company_id, aggregator_domain,
        last_scraped_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      input.name,
      input.sourceType,
      input.status,
      JSON.stringify(input.configJson),
      input.tags ? JSON.stringify(input.tags) : null,
      input.companyId ?? null,
      input.aggregatorDomain ?? null,
      toIsoString(input.lastScrapedAt),
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

    if (updates.aggregatorDomain !== undefined) {
      setClauses.push('aggregator_domain = ?')
      params.push(updates.aggregatorDomain)
    }

    if (updates.lastScrapedAt !== undefined) {
      setClauses.push('last_scraped_at = ?')
      params.push(toIsoString(updates.lastScrapedAt))
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

    const byStatus: Record<string, number> = {}
    let total = 0
    for (const row of statusRows) {
      byStatus[row.status] = row.count
      total += row.count
    }

    return {
      total,
      byStatus
    }
  }
}
