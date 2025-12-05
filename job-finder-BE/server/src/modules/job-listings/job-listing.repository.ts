import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { JobListingRecord, JobListingStatus, JobListingStats } from '@shared/types'
import { getDb } from '../../db/sqlite'

type JobListingRow = {
  id: string
  url: string
  source_id: string | null
  company_id: string | null
  title: string
  company_name: string
  location: string | null
  salary_range: string | null
  description: string
  posted_date: string | null
  status: string
  filter_result: string | null
  match_score: number | null
  created_at: string
  updated_at: string
}

const parseTimestamp = (value: string | null): Date => {
  if (!value) return new Date()
  return new Date(value)
}

const parseJson = <T = Record<string, unknown>>(value: string | null): T | null => {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

const buildJobListing = (row: JobListingRow): JobListingRecord => ({
  id: row.id,
  url: row.url,
  sourceId: row.source_id,
  companyId: row.company_id,
  title: row.title,
  companyName: row.company_name,
  location: row.location,
  salaryRange: row.salary_range,
  description: row.description,
  postedDate: row.posted_date,
  status: row.status as JobListingStatus,
  filterResult: parseJson(row.filter_result),
  matchScore: row.match_score,
  createdAt: parseTimestamp(row.created_at),
  updatedAt: parseTimestamp(row.updated_at)
})

export type CreateJobListingInput = Omit<JobListingRecord, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
export type UpdateJobListingInput = Partial<Pick<JobListingRecord, 'status' | 'filterResult' | 'companyId'>>

export interface JobListingListOptions {
  limit?: number
  offset?: number
  status?: JobListingStatus
  sourceId?: string
  companyId?: string
  search?: string
  sortBy?: 'date' | 'title' | 'company' | 'status' | 'updated' | 'score'
  sortOrder?: 'asc' | 'desc'
}

export class JobListingRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  list(options: JobListingListOptions = {}): { items: JobListingRecord[]; total: number } {
    const {
      limit = 50,
      offset = 0,
      status,
      sourceId,
      companyId,
      search,
      sortBy = 'updated',
      sortOrder = 'desc'
    } = options

    const conditions: string[] = []
    const params: unknown[] = []

    if (status) {
      conditions.push('status = ?')
      params.push(status)
    }

    if (sourceId) {
      conditions.push('source_id = ?')
      params.push(sourceId)
    }

    if (companyId) {
      conditions.push('company_id = ?')
      params.push(companyId)
    }

    if (search) {
      conditions.push('(LOWER(title) LIKE ? OR LOWER(company_name) LIKE ?)')
      const searchTerm = `%${search.toLowerCase()}%`
      params.push(searchTerm, searchTerm)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    // Map sortBy to actual columns
    const sortColumnMap: Record<string, string> = {
      date: 'created_at',
      title: 'title',
      company: 'company_name',
      status: 'status',
      updated: 'updated_at',
      score: 'match_score'
    }
    const orderColumn = sortColumnMap[sortBy] ?? 'created_at'
    const orderDirection = (sortOrder || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    // Get total count
    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM job_listings ${whereClause}`)
      .get(...params) as { count: number }
    const total = countRow.count

    // Get paginated results
    const rows = this.db
      .prepare(
        `SELECT * FROM job_listings ${whereClause} ORDER BY ${orderColumn} ${orderDirection} LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as JobListingRow[]

    return {
      items: rows.map(buildJobListing),
      total
    }
  }

  getById(id: string): JobListingRecord | null {
    const row = this.db.prepare('SELECT * FROM job_listings WHERE id = ?').get(id) as
      | JobListingRow
      | undefined
    return row ? buildJobListing(row) : null
  }

  getByUrl(url: string): JobListingRecord | null {
    const row = this.db.prepare('SELECT * FROM job_listings WHERE url = ?').get(url) as
      | JobListingRow
      | undefined
    return row ? buildJobListing(row) : null
  }

  exists(url: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM job_listings WHERE url = ? LIMIT 1').get(url)
    return row !== undefined
  }

  create(input: CreateJobListingInput): JobListingRecord {
    const id = input.id ?? randomUUID()
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO job_listings (
        id, url, source_id, company_id, title, company_name,
        location, salary_range, description, posted_date,
        status, filter_result, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      input.url,
      input.sourceId ?? null,
      input.companyId ?? null,
      input.title,
      input.companyName,
      input.location ?? null,
      input.salaryRange ?? null,
      input.description,
      input.postedDate ?? null,
      input.status,
      input.filterResult ? JSON.stringify(input.filterResult) : null,
      now,
      now
    )

    return this.getById(id) as JobListingRecord
  }

  update(id: string, updates: UpdateJobListingInput): JobListingRecord | null {
    const existing = this.getById(id)
    if (!existing) return null

    const now = new Date().toISOString()
    const setClauses: string[] = ['updated_at = ?']
    const params: unknown[] = [now]

    if (updates.status !== undefined) {
      setClauses.push('status = ?')
      params.push(updates.status)
    }

    if (updates.filterResult !== undefined) {
      setClauses.push('filter_result = ?')
      params.push(updates.filterResult ? JSON.stringify(updates.filterResult) : null)
    }

    if (updates.companyId !== undefined) {
      setClauses.push('company_id = ?')
      params.push(updates.companyId)
    }

    params.push(id)
    this.db.prepare(`UPDATE job_listings SET ${setClauses.join(', ')} WHERE id = ?`).run(...params)

    return this.getById(id)
  }

  updateStatus(id: string, status: JobListingStatus): JobListingRecord | null {
    return this.update(id, { status })
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM job_listings WHERE id = ?').run(id)
  }

  /**
   * Get stats for job listings grouped by status.
   * Used for summary pills in the UI.
   */
  getStats(): JobListingStats {
    const rows = this.db
      .prepare(`
        SELECT status, COUNT(*) as count
        FROM job_listings
        GROUP BY status
      `)
      .all() as { status: string; count: number }[]

    const stats: JobListingStats = {
      total: 0,
      pending: 0,
      analyzing: 0,
      analyzed: 0,
      matched: 0,
      skipped: 0
    }

    for (const row of rows) {
      const count = row.count
      stats.total += count
      if (row.status in stats) {
        stats[row.status as keyof Omit<JobListingStats, 'total'>] = count
      }
    }

    return stats
  }

  /**
   * Batch check if URLs exist in job_listings.
   * Returns a map of URL -> exists boolean.
   */
  batchCheckExists(urls: string[]): Map<string, boolean> {
    if (urls.length === 0) return new Map()

    const results = new Map<string, boolean>()
    urls.forEach((url) => results.set(url, false))

    // Process in chunks to avoid SQLite parameter limits
    const chunkSize = 50
    for (let i = 0; i < urls.length; i += chunkSize) {
      const chunk = urls.slice(i, i + chunkSize)
      const placeholders = chunk.map(() => '?').join(',')
      const rows = this.db
        .prepare(`SELECT url FROM job_listings WHERE url IN (${placeholders})`)
        .all(...chunk) as { url: string }[]

      rows.forEach((row) => results.set(row.url, true))
    }

    return results
  }
}
