import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { JobMatch, JobMatchWithListing, TimestampLike, JobMatchStats } from '@shared/types'
import { getDb } from '../../db/sqlite'
import { JobListingRepository } from '../job-listings/job-listing.repository'
import { CompanyRepository } from '../companies/company.repository'

type JobMatchRow = {
  id: string
  job_listing_id: string
  match_score: number
  application_priority: string | null
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
  experienceMatch: row.experience_match,
  customizationRecommendations: parseJsonArray(row.customization_recommendations),
  resumeIntakeData: row.resume_intake_json ? JSON.parse(row.resume_intake_json) : undefined,
  applicationPriority: (row.application_priority as JobMatch['applicationPriority']) ?? undefined,
  analyzedAt: parseTimestamp(row.analyzed_at),
  createdAt: parseTimestamp(row.created_at),
  submittedBy: row.submitted_by,
  queueItemId: row.queue_item_id
})

export type CreateJobMatchInput = Omit<JobMatch, 'id'> & { id?: string }

const toIsoString = (value: TimestampLike | string | Date | undefined): string => {
  if (!value) return new Date().toISOString()
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string') return new Date(value).toISOString()
  if ('toDate' in value) return value.toDate().toISOString()
  return new Date().toISOString()
}

interface JobMatchListOptions {
  limit?: number
  offset?: number
  minScore?: number
  maxScore?: number
  jobListingId?: string
  sortBy?: 'score' | 'date'
  sortOrder?: 'asc' | 'desc'
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
      sortBy = 'date',
      sortOrder = 'desc'
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

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderColumn = sortBy === 'score' ? 'match_score' : 'created_at'
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
   * This is the preferred method for API responses.
   */
  listWithListings(options: JobMatchListOptions = {}): JobMatchWithListing[] {
    const matches = this.list(options)
    return matches.map((match) => {
      const listing = this.listingRepo.getById(match.jobListingId)
      if (!listing) {
        throw new Error(`Job listing ${match.jobListingId} not found for match ${match.id}`)
      }
      const company = listing.companyId ? this.companyRepo.getById(listing.companyId) : null
      return {
        ...match,
        listing,
        company
      }
    })
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

    const stmt = this.db.prepare(`
      INSERT INTO job_matches (
        id, job_listing_id, match_score, matched_skills, missing_skills,
        match_reasons, key_strengths, potential_concerns, experience_match,
        customization_recommendations, resume_intake_json,
        analyzed_at, submitted_by, queue_item_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        updated_at = excluded.updated_at
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
      now
    )

    return this.getById(id) as JobMatch
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM job_matches WHERE id = ?').run(id)
  }

  /**
   * Get stats for job matches grouped by score range.
   * Used for summary pills in the UI.
   */
  getStats(): JobMatchStats {
    const result = this.db
      .prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN match_score >= 80 THEN 1 ELSE 0 END) as highScore,
          SUM(CASE WHEN match_score >= 50 AND match_score < 80 THEN 1 ELSE 0 END) as mediumScore,
          SUM(CASE WHEN match_score < 50 THEN 1 ELSE 0 END) as lowScore,
          AVG(match_score) as averageScore
        FROM job_matches
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
      averageScore: Math.round(result.averageScore ?? 0)
    }
  }
}
