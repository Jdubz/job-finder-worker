import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { JobMatch, JobMatchWithListing, JobListingRecord, JobListingStatus, Company, TimestampLike, JobMatchStats } from '@shared/types'
import { getDb } from '../../db/sqlite'
import { JobListingRepository } from '../job-listings/job-listing.repository'
import { CompanyRepository } from '../companies/company.repository'

type JobMatchRow = {
  id: string
  job_listing_id: string
  match_score: number
  matched_skills: string | null
  missing_skills: string | null
  match_reasons: string | null
  key_strengths: string | null
  potential_concerns: string | null
  experience_match: number
  customization_recommendations: string | null
  resume_intake_json: string | null
  analyzed_at: string | null
  submitted_by: string | null
  queue_item_id: string
  created_at: string
  updated_at: string
  status: string
  ignored_at: string | null
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
    return []
  }
}

const buildJobMatch = (row: JobMatchRow): JobMatch => ({
  id: row.id,
  jobListingId: row.job_listing_id,
  matchScore: row.match_score,
  matchedSkills: parseJsonArray(row.matched_skills),
  missingSkills: parseJsonArray(row.missing_skills),
  matchReasons: parseJsonArray(row.match_reasons),
  keyStrengths: parseJsonArray(row.key_strengths),
  potentialConcerns: parseJsonArray(row.potential_concerns),
  // experienceMatch deprecated; keep numeric for backward compat but no longer surfaced
  experienceMatch: row.experience_match,
  customizationRecommendations: parseJsonArray(row.customization_recommendations),
  resumeIntakeData: row.resume_intake_json ? JSON.parse(row.resume_intake_json) : undefined,
  analyzedAt: parseTimestamp(row.analyzed_at),
  createdAt: parseTimestamp(row.created_at),
  updatedAt: parseTimestamp(row.updated_at),
  submittedBy: row.submitted_by,
  queueItemId: row.queue_item_id,
  status: (row.status as JobMatch['status']) ?? 'active',
  ignoredAt: row.ignored_at ? parseTimestamp(row.ignored_at) : undefined
})

/** Raw row shape returned by the JOIN query in listWithListings */
type JoinedRow = JobMatchRow & {
  // job_listings columns (prefixed l_)
  l_id: string
  l_url: string
  l_source_id: string | null
  l_company_id: string | null
  l_title: string
  l_company_name: string
  l_location: string | null
  l_salary_range: string | null
  l_description: string
  l_posted_date: string | null
  l_status: string
  l_filter_result: string | null
  l_match_score: number | null
  l_apply_url: string | null
  l_content_fingerprint: string | null
  l_created_at: string
  l_updated_at: string
  // companies columns (prefixed c_) — all nullable due to LEFT JOIN
  c_id: string | null
  c_name: string | null
  c_website: string | null
  c_about: string | null
  c_culture: string | null
  c_mission: string | null
  c_company_size_category: string | null
  c_industry: string | null
  c_headquarters_location: string | null
  c_has_portland_office: number | null
  c_tech_stack: string | null
  c_created_at: string | null
  c_updated_at: string | null
}

const parseJsonSafe = <T = Record<string, unknown>>(value: string | null): T | null => {
  if (!value) return null
  try { return JSON.parse(value) as T } catch { return null }
}

const parseJsonArraySafe = (value: string | null): string[] => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return value.split(',').map((s) => s.trim()).filter(Boolean)
  }
}

function buildListingFromRow(row: JoinedRow): JobListingRecord {
  return {
    id: row.l_id,
    url: row.l_url,
    sourceId: row.l_source_id,
    companyId: row.l_company_id,
    title: row.l_title,
    companyName: row.l_company_name,
    location: row.l_location,
    salaryRange: row.l_salary_range,
    description: row.l_description,
    postedDate: row.l_posted_date,
    status: row.l_status as JobListingStatus,
    filterResult: parseJsonSafe(row.l_filter_result),
    matchScore: row.l_match_score,
    applyUrl: row.l_apply_url,
    contentFingerprint: row.l_content_fingerprint,
    createdAt: parseTimestamp(row.l_created_at),
    updatedAt: parseTimestamp(row.l_updated_at)
  }
}

function buildCompanyFromRow(row: JoinedRow): Company | null {
  if (!row.c_id) return null
  return {
    id: row.c_id,
    name: row.c_name!,
    website: row.c_website ?? '',
    about: row.c_about ?? null,
    culture: row.c_culture ?? null,
    mission: row.c_mission ?? null,
    industry: row.c_industry ?? null,
    headquartersLocation: row.c_headquarters_location ?? null,
    companySizeCategory: (row.c_company_size_category as Company['companySizeCategory']) ?? null,
    techStack: parseJsonArraySafe(row.c_tech_stack),
    createdAt: parseTimestamp(row.c_created_at),
    updatedAt: parseTimestamp(row.c_updated_at)
  }
}

export type CreateJobMatchInput = Omit<JobMatch, 'id'> & { id?: string }

const toIsoString = (value: TimestampLike | string | Date | undefined): string => {
  if (!value) return new Date().toISOString()
  if (value instanceof Date) {
    const time = value.getTime()
    return Number.isNaN(time) ? new Date().toISOString() : value.toISOString()
  }
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
  }
  if ('toDate' in value) return value.toDate().toISOString()
  return new Date().toISOString()
}

interface JobMatchListOptions {
  limit?: number
  offset?: number
  minScore?: number
  maxScore?: number
  jobListingId?: string
  sortBy?: 'score' | 'date' | 'updated'
  sortOrder?: 'asc' | 'desc'
  status?: 'active' | 'ignored' | 'applied' | 'all'
}

export class JobMatchRepository {
  private db: Database.Database
  private listingRepo: JobListingRepository
  private companyRepo: CompanyRepository

  constructor() {
    this.db = getDb()
    this.listingRepo = new JobListingRepository()
    this.companyRepo = new CompanyRepository()
  }

  list(options: JobMatchListOptions = {}): JobMatch[] {
    const {
      limit = 50,
      offset = 0,
      minScore,
      maxScore,
      jobListingId,
      sortBy = 'updated',
      sortOrder = 'desc',
      status
    } = options

    const conditions: string[] = []
    const params: unknown[] = []

    if (typeof minScore === 'number') {
      conditions.push('match_score >= ?')
      params.push(minScore)
    }

    if (typeof maxScore === 'number') {
      conditions.push('match_score <= ?')
      params.push(maxScore)
    }

    if (jobListingId) {
      conditions.push('job_listing_id = ?')
      params.push(jobListingId)
    }

    if (status && status !== 'all') {
      conditions.push('status = ?')
      params.push(status)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const sortColumnMap: Record<string, string> = {
      score: 'match_score',
      date: 'created_at',
      updated: 'updated_at'
    }
    const orderColumn = sortColumnMap[sortBy] ?? 'updated_at'
    const orderDirection = (sortOrder || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    const rows = this.db
      .prepare(
        `SELECT * FROM job_matches ${whereClause} ORDER BY ${orderColumn} ${orderDirection} LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as JobMatchRow[]

    return rows.map(buildJobMatch)
  }

  /**
   * List job matches with their associated listing and company data.
   * Uses a single JOIN query instead of N+1 individual lookups.
   */
  listWithListings(options: JobMatchListOptions = {}): JobMatchWithListing[] {
    const {
      limit = 50,
      offset = 0,
      minScore,
      maxScore,
      jobListingId,
      sortBy = 'updated',
      sortOrder = 'desc',
      status
    } = options

    const conditions: string[] = []
    const params: unknown[] = []

    if (typeof minScore === 'number') {
      conditions.push('m.match_score >= ?')
      params.push(minScore)
    }
    if (typeof maxScore === 'number') {
      conditions.push('m.match_score <= ?')
      params.push(maxScore)
    }
    if (jobListingId) {
      conditions.push('m.job_listing_id = ?')
      params.push(jobListingId)
    }
    if (status && status !== 'all') {
      conditions.push('m.status = ?')
      params.push(status)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const sortColumnMap: Record<string, string> = {
      score: 'm.match_score',
      date: 'm.created_at',
      updated: 'm.updated_at'
    }
    const orderColumn = sortColumnMap[sortBy] ?? 'm.updated_at'
    const orderDirection = (sortOrder || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    const sql = `
      SELECT
        m.*,
        l.id          AS l_id,
        l.url         AS l_url,
        l.source_id   AS l_source_id,
        l.company_id  AS l_company_id,
        l.title       AS l_title,
        l.company_name AS l_company_name,
        l.location    AS l_location,
        l.salary_range AS l_salary_range,
        l.description AS l_description,
        l.posted_date AS l_posted_date,
        l.status      AS l_status,
        l.filter_result AS l_filter_result,
        l.match_score AS l_match_score,
        l.apply_url   AS l_apply_url,
        l.content_fingerprint AS l_content_fingerprint,
        l.created_at  AS l_created_at,
        l.updated_at  AS l_updated_at,
        c.id          AS c_id,
        c.name        AS c_name,
        c.website     AS c_website,
        c.about       AS c_about,
        c.culture     AS c_culture,
        c.mission     AS c_mission,
        c.company_size_category AS c_company_size_category,
        c.industry    AS c_industry,
        c.headquarters_location AS c_headquarters_location,
        c.has_portland_office AS c_has_portland_office,
        c.tech_stack  AS c_tech_stack,
        c.created_at  AS c_created_at,
        c.updated_at  AS c_updated_at
      FROM job_matches m
      INNER JOIN job_listings l ON l.id = m.job_listing_id
      LEFT JOIN companies c ON c.id = l.company_id
      ${whereClause}
      ORDER BY ${orderColumn} ${orderDirection}
      LIMIT ? OFFSET ?
    `

    const rows = this.db.prepare(sql).all(...params, limit, offset) as JoinedRow[]

    return rows.map((row) => ({
      ...buildJobMatch(row),
      listing: buildListingFromRow(row),
      company: buildCompanyFromRow(row)
    }))
  }

  getById(id: string): JobMatch | null {
    const row = this.db.prepare('SELECT * FROM job_matches WHERE id = ?').get(id) as JobMatchRow | undefined
    return row ? buildJobMatch(row) : null
  }

  getByIdWithListing(id: string): JobMatchWithListing | null {
    const match = this.getById(id)
    if (!match) return null

    const listing = this.listingRepo.getById(match.jobListingId)
    if (!listing) return null

    // Fetch company data if companyId exists on the listing
    const company = listing.companyId ? this.companyRepo.getById(listing.companyId) : null

    return { ...match, listing, company }
  }

  getByJobListingId(jobListingId: string): JobMatch | null {
    const row = this.db
      .prepare('SELECT * FROM job_matches WHERE job_listing_id = ?')
      .get(jobListingId) as JobMatchRow | undefined
    return row ? buildJobMatch(row) : null
  }

  upsert(match: CreateJobMatchInput): JobMatch {
    const id = match.id ?? randomUUID()
    const now = new Date().toISOString()
    const isIgnored = match.status === 'ignored'
    const ignoredAt = isIgnored ? toIsoString(match.ignoredAt ?? now) : null

    const stmt = this.db.prepare(`
      INSERT INTO job_matches (
        id, job_listing_id, match_score, matched_skills, missing_skills,
        match_reasons, key_strengths, potential_concerns, experience_match,
        customization_recommendations, resume_intake_json,
        analyzed_at, submitted_by, queue_item_id, created_at, updated_at,
        status, ignored_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        job_listing_id = excluded.job_listing_id,
        match_score = excluded.match_score,
        matched_skills = excluded.matched_skills,
        missing_skills = excluded.missing_skills,
        match_reasons = excluded.match_reasons,
        key_strengths = excluded.key_strengths,
        potential_concerns = excluded.potential_concerns,
        experience_match = excluded.experience_match,
        customization_recommendations = excluded.customization_recommendations,
        resume_intake_json = excluded.resume_intake_json,
        analyzed_at = excluded.analyzed_at,
        submitted_by = excluded.submitted_by,
        queue_item_id = excluded.queue_item_id,
        updated_at = excluded.updated_at,
        status = excluded.status,
        ignored_at = excluded.ignored_at
    `)

    stmt.run(
      id,
      match.jobListingId,
      match.matchScore,
      JSON.stringify(match.matchedSkills ?? []),
      JSON.stringify(match.missingSkills ?? []),
      JSON.stringify(match.matchReasons ?? []),
      JSON.stringify(match.keyStrengths ?? []),
      JSON.stringify(match.potentialConcerns ?? []),
      match.experienceMatch,
      JSON.stringify(match.customizationRecommendations ?? []),
      match.resumeIntakeData ? JSON.stringify(match.resumeIntakeData) : null,
      toIsoString(match.analyzedAt),
      match.submittedBy ?? null,
      match.queueItemId,
      toIsoString(match.createdAt),
      now,
      match.status ?? 'active',
      ignoredAt
    )

    return this.getById(id) as JobMatch
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM job_matches WHERE id = ?').run(id)
  }

  updateStatus(id: string, status: 'active' | 'ignored' | 'applied'): JobMatchWithListing | null {
    // First check if the match exists before attempting update
    const existingMatch = this.getById(id)
    if (!existingMatch) {
      return null
    }

    const now = new Date().toISOString()
    const result = this.db
      .prepare(
        `UPDATE job_matches
         SET status = @status,
             ignored_at = CASE WHEN @status = 'ignored' THEN @now ELSE NULL END,
             updated_at = @now
         WHERE id = @id`
      )
      .run({ status, now, id })

    // Verify the update succeeded
    if (result.changes === 0) {
      return null
    }

    // Try to get the updated match with listing
    const matchWithListing = this.getByIdWithListing(id)

    // If listing is missing, this is a data integrity issue
    // The status was updated, but we can't return the full data
    if (!matchWithListing) {
      console.error(
        `Data integrity error: Job match ${id} was updated but associated listing is missing. ` +
        `This indicates orphaned data that should be cleaned up.`
      )
      return null
    }

    return matchWithListing
  }

  /**
   * Get stats for job matches grouped by score range.
   * Used for summary pills in the UI.
   */
  getStats(includeIgnored = false): JobMatchStats {
    const whereClause = includeIgnored ? '' : "WHERE status != 'ignored'"
    const result = this.db
      .prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN match_score >= 80 THEN 1 ELSE 0 END) as highScore,
          SUM(CASE WHEN match_score >= 50 AND match_score < 80 THEN 1 ELSE 0 END) as mediumScore,
          SUM(CASE WHEN match_score < 50 THEN 1 ELSE 0 END) as lowScore,
          AVG(match_score) as averageScore
        FROM job_matches
        ${whereClause}
      `)
      .get() as {
      total: number
      highScore: number
      mediumScore: number
      lowScore: number
      averageScore: number | null
    }

    return {
      total: result.total ?? 0,
      highScore: result.highScore ?? 0,
      mediumScore: result.mediumScore ?? 0,
      lowScore: result.lowScore ?? 0,
      averageScore: result.averageScore ?? 0
    }
  }
}
