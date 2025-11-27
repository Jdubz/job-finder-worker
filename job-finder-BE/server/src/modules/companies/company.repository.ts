import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { Company } from '@shared/types'
import { getDb } from '../../db/sqlite'

type CompanyRow = {
  id: string
  name: string
  name_lower: string
  website: string | null
  about: string | null
  culture: string | null
  mission: string | null
  company_size_category: string | null
  industry: string | null
  headquarters_location: string | null
  has_portland_office: number
  tech_stack: string | null
  created_at: string
  updated_at: string
}

const parseTimestamp = (value: string | null): Date => {
  if (!value) return new Date()
  return new Date(value)
}

const parseJsonArray = (value: string | null): string[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    // Handle comma-separated format
    return value.split(',').map((s) => s.trim()).filter(Boolean)
  }
}

const buildCompany = (row: CompanyRow): Company => ({
  id: row.id,
  name: row.name,
  website: row.website ?? '',
  about: row.about,
  culture: row.culture,
  mission: row.mission,
  industry: row.industry,
  headquartersLocation: row.headquarters_location,
  companySizeCategory: row.company_size_category as Company['companySizeCategory'],
  techStack: parseJsonArray(row.tech_stack),
  createdAt: parseTimestamp(row.created_at),
  updatedAt: parseTimestamp(row.updated_at)
})

export type CreateCompanyInput = Omit<Company, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
export type UpdateCompanyInput = Partial<Omit<Company, 'id' | 'createdAt' | 'updatedAt'>>

export interface CompanyListOptions {
  limit?: number
  offset?: number
  industry?: string
  search?: string
  sortBy?: 'name' | 'created_at' | 'updated_at'
  sortOrder?: 'asc' | 'desc'
}

export class CompanyRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  list(options: CompanyListOptions = {}): { items: Company[]; total: number } {
    const {
      limit = 50,
      offset = 0,
      industry,
      search,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = options

    const conditions: string[] = []
    const params: unknown[] = []

    if (industry) {
      conditions.push('LOWER(industry) = ?')
      params.push(industry.toLowerCase())
    }

    if (search) {
      conditions.push('(name_lower LIKE ? OR LOWER(website) LIKE ?)')
      const searchTerm = `%${search.toLowerCase()}%`
      params.push(searchTerm, searchTerm)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

    // Map sortBy to actual columns
    const sortColumnMap: Record<string, string> = {
      name: 'name_lower',
      created_at: 'created_at',
      updated_at: 'updated_at'
    }
    const orderColumn = sortColumnMap[sortBy] ?? 'created_at'
    const orderDirection = (sortOrder || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    // Get total count
    const countRow = this.db
      .prepare(`SELECT COUNT(*) as count FROM companies ${whereClause}`)
      .get(...params) as { count: number }
    const total = countRow.count

    // Get paginated results
    const rows = this.db
      .prepare(
        `SELECT * FROM companies ${whereClause} ORDER BY ${orderColumn} ${orderDirection} LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as CompanyRow[]

    return {
      items: rows.map(buildCompany),
      total
    }
  }

  getById(id: string): Company | null {
    const row = this.db.prepare('SELECT * FROM companies WHERE id = ?').get(id) as
      | CompanyRow
      | undefined
    return row ? buildCompany(row) : null
  }

  getByName(name: string): Company | null {
    const row = this.db.prepare('SELECT * FROM companies WHERE name_lower = ?').get(name.toLowerCase()) as
      | CompanyRow
      | undefined
    return row ? buildCompany(row) : null
  }

  create(input: CreateCompanyInput): Company {
    const id = input.id ?? randomUUID()
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO companies (
        id, name, name_lower, website, about, culture, mission,
        company_size_category, industry, headquarters_location,
        has_portland_office, tech_stack,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(
      id,
      input.name,
      input.name.toLowerCase(),
      input.website ?? null,
      input.about ?? null,
      input.culture ?? null,
      input.mission ?? null,
      input.companySizeCategory ?? null,
      input.industry ?? null,
      input.headquartersLocation ?? null,
      0, // has_portland_office
      input.techStack ? JSON.stringify(input.techStack) : null,
      now,
      now
    )

    return this.getById(id) as Company
  }

  update(id: string, updates: UpdateCompanyInput): Company | null {
    const existing = this.getById(id)
    if (!existing) return null

    const now = new Date().toISOString()
    const setClauses: string[] = ['updated_at = ?']
    const params: unknown[] = [now]

    if (updates.name !== undefined) {
      setClauses.push('name = ?', 'name_lower = ?')
      params.push(updates.name, updates.name.toLowerCase())
    }

    if (updates.website !== undefined) {
      setClauses.push('website = ?')
      params.push(updates.website)
    }

    if (updates.about !== undefined) {
      setClauses.push('about = ?')
      params.push(updates.about)
    }

    if (updates.culture !== undefined) {
      setClauses.push('culture = ?')
      params.push(updates.culture)
    }

    if (updates.mission !== undefined) {
      setClauses.push('mission = ?')
      params.push(updates.mission)
    }

    if (updates.industry !== undefined) {
      setClauses.push('industry = ?')
      params.push(updates.industry)
    }

    if (updates.headquartersLocation !== undefined) {
      setClauses.push('headquarters_location = ?')
      params.push(updates.headquartersLocation)
    }

    if (updates.companySizeCategory !== undefined) {
      setClauses.push('company_size_category = ?')
      params.push(updates.companySizeCategory)
    }

    if (updates.techStack !== undefined) {
      setClauses.push('tech_stack = ?')
      params.push(updates.techStack ? JSON.stringify(updates.techStack) : null)
    }

    params.push(id)
    this.db.prepare(`UPDATE companies SET ${setClauses.join(', ')} WHERE id = ?`).run(...params)

    return this.getById(id)
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM companies WHERE id = ?').run(id)
  }
}
