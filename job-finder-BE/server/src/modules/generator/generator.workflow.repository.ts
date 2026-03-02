import type Database from 'better-sqlite3'
import type { GenerationStep, PersonalInfo, ResumeContent, CoverLetterContent } from '@shared/types'
import { getDb } from '../../db/sqlite'
import { logger } from '../../logger'

/**
 * Safely parse JSON with error handling.
 * Returns null if parsing fails instead of throwing.
 */
function safeJsonParse<T>(json: string | null | undefined, fieldName: string): T | null {
  if (!json) return null
  try {
    return JSON.parse(json) as T
  } catch (err) {
    logger.error({ fieldName, jsonPreview: json.slice(0, 100), err }, 'Failed to parse JSON field in generator request')
    return null
  }
}

export interface IntermediateResults {
  resumeContent?: ResumeContent
  coverLetterContent?: CoverLetterContent
  /** Number of times the user has rejected and regenerated a document. */
  rejectionCount?: number
}

export interface GeneratorRequestRecord {
  id: string
  generateType: 'resume' | 'coverLetter' | 'both'
  job: Record<string, unknown>
  preferences?: Record<string, unknown> | null
  personalInfo?: PersonalInfo | null
  status: 'pending' | 'processing' | 'awaiting_review' | 'completed' | 'failed'
  resumeUrl?: string | null
  coverLetterUrl?: string | null
  jobMatchId?: string | null
  createdBy?: string | null
  steps?: GenerationStep[] | null
  intermediateResults?: IntermediateResults | null
  createdAt: string
  updatedAt: string
}

export interface GeneratorArtifactRecord {
  id: string
  requestId: string
  artifactType: string
  filename: string
  storagePath: string
  sizeBytes?: number | null
  createdAt: string
}

/** SQLite row shape for generator_requests table */
interface GeneratorRequestRow {
  id: string
  generate_type: string
  job_json: string
  preferences_json: string | null
  personal_info_json: string | null
  status: string
  resume_url: string | null
  cover_letter_url: string | null
  job_match_id: string | null
  created_by: string | null
  steps_json: string | null
  intermediate_results_json: string | null
  created_at: string
  updated_at: string
}

export class GeneratorWorkflowRepository {
  private db: Database.Database

  private mergeJsonField<T>(updateValue: T | null | undefined, existingValue: T | null | undefined): string | null {
    const value = updateValue !== undefined ? updateValue : existingValue
    return value ? JSON.stringify(value) : null
  }

  constructor() {
    this.db = getDb()
  }

  createRequest(record: Omit<GeneratorRequestRecord, 'createdAt' | 'updatedAt'>): GeneratorRequestRecord {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO generator_requests
         (id, generate_type, job_json, preferences_json, personal_info_json, status, resume_url, cover_letter_url, job_match_id, created_by, steps_json, intermediate_results_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.generateType,
        JSON.stringify(record.job ?? {}),
        record.preferences ? JSON.stringify(record.preferences) : null,
        record.personalInfo ? JSON.stringify(record.personalInfo) : null,
        record.status,
        record.resumeUrl ?? null,
        record.coverLetterUrl ?? null,
        record.jobMatchId ?? null,
        record.createdBy ?? null,
        record.steps ? JSON.stringify(record.steps) : null,
        record.intermediateResults ? JSON.stringify(record.intermediateResults) : null,
        now,
        now
      )
    return this.getRequest(record.id)!
  }

  updateRequest(
    id: string,
    updates: Partial<Omit<GeneratorRequestRecord, 'id' | 'generateType' | 'job'> & { job?: Record<string, unknown> }>
  ): GeneratorRequestRecord | null {
    const existing = this.getRequest(id)
    if (!existing) {
      return null
    }

    const mergedJob = updates.job ? JSON.stringify(updates.job) : JSON.stringify(existing.job)
    const mergedPrefs = this.mergeJsonField(updates.preferences, existing.preferences)
    const mergedPersonal = this.mergeJsonField(updates.personalInfo, existing.personalInfo)
    const mergedSteps = this.mergeJsonField(updates.steps, existing.steps)
    const mergedIntermediate = this.mergeJsonField(updates.intermediateResults, existing.intermediateResults)

    this.db
      .prepare(
        `UPDATE generator_requests
         SET status = ?, resume_url = ?, cover_letter_url = ?, job_match_id = ?, job_json = ?, preferences_json = ?, personal_info_json = ?, steps_json = ?, intermediate_results_json = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        updates.status ?? existing.status,
        updates.resumeUrl ?? existing.resumeUrl ?? null,
        updates.coverLetterUrl ?? existing.coverLetterUrl ?? null,
        updates.jobMatchId ?? existing.jobMatchId ?? null,
        mergedJob,
        mergedPrefs,
        mergedPersonal,
        mergedSteps,
        mergedIntermediate,
        new Date().toISOString(),
        id
      )

    return this.getRequest(id)
  }

  listRequests(limit = 50, jobMatchId?: string): GeneratorRequestRecord[] {
    const whereClause = jobMatchId ? 'WHERE job_match_id = ?' : ''
    const rows = this.db
      .prepare(
        `SELECT * FROM generator_requests
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(...(jobMatchId ? [jobMatchId, limit] : [limit])) as GeneratorRequestRow[]

    return rows.map((row) => this.mapRequest(row))
  }

  getRequest(id: string): GeneratorRequestRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM generator_requests
         WHERE id = ?`
      )
      .get(id) as GeneratorRequestRow | undefined

    return row ? this.mapRequest(row) : null
  }

  addArtifact(record: GeneratorArtifactRecord): GeneratorArtifactRecord {
    this.db
      .prepare(
        `INSERT INTO generator_artifacts
         (id, request_id, artifact_type, filename, storage_path, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.requestId,
        record.artifactType,
        record.filename,
        record.storagePath,
        record.sizeBytes ?? null,
        record.createdAt
      )
    return record
  }

  listArtifacts(requestId: string): GeneratorArtifactRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM generator_artifacts
         WHERE request_id = ?
         ORDER BY created_at ASC`
      )
      .all(requestId) as Array<{
      id: string
      request_id: string
      artifact_type: string
      filename: string
      storage_path: string
      size_bytes: number | null
      created_at: string
    }>

    return rows.map((row) => ({
      id: row.id,
      requestId: row.request_id,
      artifactType: row.artifact_type,
      filename: row.filename,
      storagePath: row.storage_path,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at
    }))
  }

  private mapRequest(row: GeneratorRequestRow): GeneratorRequestRecord {
    // job is required - use safe parse but provide fallback
    const job = safeJsonParse<Record<string, unknown>>(row.job_json, 'job') ?? {}

    return {
      id: row.id,
      generateType: row.generate_type as GeneratorRequestRecord['generateType'],
      job,
      preferences: safeJsonParse<Record<string, unknown>>(row.preferences_json, 'preferences'),
      personalInfo: safeJsonParse<PersonalInfo>(row.personal_info_json, 'personalInfo'),
      status: row.status as GeneratorRequestRecord['status'],
      resumeUrl: row.resume_url,
      coverLetterUrl: row.cover_letter_url,
      jobMatchId: row.job_match_id,
      createdBy: row.created_by,
      steps: safeJsonParse<GenerationStep[]>(row.steps_json, 'steps'),
      intermediateResults: safeJsonParse<IntermediateResults>(row.intermediate_results_json, 'intermediateResults'),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}
