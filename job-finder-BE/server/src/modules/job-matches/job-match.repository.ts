import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { JobMatch, TimestampLike } from '@shared/types'
import { getDb } from '../../db/sqlite'

type JobMatchRow = {
  id: string
  url: string
  company_name: string
  company_id: string | null
  job_title: string
  location: string | null
  salary_range: string | null
  job_description: string
  company_info: string | null
  match_score: number
  matched_skills: string | null
  missing_skills: string | null
  match_reasons: string | null
  key_strengths: string | null
  potential_concerns: string | null
  experience_match: number
  application_priority: string
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
  url: row.url,
  companyName: row.company_name,
  companyId: row.company_id,
  jobTitle: row.job_title,
  location: row.location,
  salaryRange: row.salary_range,
  jobDescription: row.job_description,
  companyInfo: row.company_info,
  matchScore: row.match_score,
  matchedSkills: parseJsonArray(row.matched_skills),
  missingSkills: parseJsonArray(row.missing_skills),
  matchReasons: parseJsonArray(row.match_reasons),
  keyStrengths: parseJsonArray(row.key_strengths),
  potentialConcerns: parseJsonArray(row.potential_concerns),
  experienceMatch: row.experience_match,
  applicationPriority: row.application_priority as JobMatch['applicationPriority'],
  customizationRecommendations: parseJsonArray(row.customization_recommendations),
  resumeIntakeData: row.resume_intake_json ? JSON.parse(row.resume_intake_json) : undefined,
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
  companyName?: string
  priority?: JobMatch['applicationPriority']
  sortBy?: 'score' | 'date' | 'company'
  sortOrder?: 'asc' | 'desc'
}

export class JobMatchRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  list(options: JobMatchListOptions = {}): JobMatch[] {
    const {
      limit = 50,
      offset = 0,
      minScore,
      maxScore,
      companyName,
      priority,
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

    if (companyName) {
      conditions.push('LOWER(company_name) LIKE ?')
      params.push(`%${companyName.toLowerCase()}%`)
    }

    if (priority) {
      conditions.push('application_priority = ?')
      params.push(priority)
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const orderColumn = sortBy === 'score' ? 'match_score' : sortBy === 'company' ? 'company_name' : 'created_at'
    const orderDirection = (sortOrder || '').toUpperCase() === 'ASC' ? 'ASC' : 'DESC'

    const rows = this.db
      .prepare(
        `SELECT * FROM job_matches ${whereClause} ORDER BY ${orderColumn} ${orderDirection} LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as JobMatchRow[]

    return rows.map(buildJobMatch)
  }

  getById(id: string): JobMatch | null {
    const row = this.db.prepare('SELECT * FROM job_matches WHERE id = ?').get(id) as JobMatchRow | undefined
    return row ? buildJobMatch(row) : null
  }

  upsert(match: CreateJobMatchInput): JobMatch {
    const id = match.id ?? randomUUID()
    const now = new Date().toISOString()

    const stmt = this.db.prepare(`
      INSERT INTO job_matches (
        id, url, company_name, company_id, job_title, location, salary_range,
        job_description, company_info, match_score, matched_skills, missing_skills,
        match_reasons, key_strengths, potential_concerns, experience_match,
        application_priority, customization_recommendations, resume_intake_json,
        analyzed_at, submitted_by, queue_item_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        url = excluded.url,
        company_name = excluded.company_name,
        company_id = excluded.company_id,
        job_title = excluded.job_title,
        location = excluded.location,
        salary_range = excluded.salary_range,
        job_description = excluded.job_description,
        company_info = excluded.company_info,
        match_score = excluded.match_score,
        matched_skills = excluded.matched_skills,
        missing_skills = excluded.missing_skills,
        match_reasons = excluded.match_reasons,
        key_strengths = excluded.key_strengths,
        potential_concerns = excluded.potential_concerns,
        experience_match = excluded.experience_match,
        application_priority = excluded.application_priority,
        customization_recommendations = excluded.customization_recommendations,
        resume_intake_json = excluded.resume_intake_json,
        analyzed_at = excluded.analyzed_at,
        submitted_by = excluded.submitted_by,
        queue_item_id = excluded.queue_item_id,
        updated_at = excluded.updated_at
    `)

    stmt.run(
      id,
      match.url,
      match.companyName,
      match.companyId ?? null,
      match.jobTitle,
      match.location ?? null,
      match.salaryRange ?? null,
      match.jobDescription,
      match.companyInfo ?? null,
      match.matchScore,
      JSON.stringify(match.matchedSkills ?? []),
      JSON.stringify(match.missingSkills ?? []),
      JSON.stringify(match.matchReasons ?? []),
      JSON.stringify(match.keyStrengths ?? []),
      JSON.stringify(match.potentialConcerns ?? []),
      match.experienceMatch,
      match.applicationPriority,
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
}
