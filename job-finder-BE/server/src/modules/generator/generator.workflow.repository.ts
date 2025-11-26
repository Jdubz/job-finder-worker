import type Database from 'better-sqlite3'
import type { GenerationStep, PersonalInfo } from '@shared/types'
import { getDb } from '../../db/sqlite'

export interface GeneratorRequestRecord {
  id: string
  generateType: 'resume' | 'coverLetter' | 'both'
  job: Record<string, unknown>
  preferences?: Record<string, unknown> | null
  personalInfo?: PersonalInfo | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  resumeUrl?: string | null
  coverLetterUrl?: string | null
  jobMatchId?: string | null
  createdBy?: string | null
  steps?: GenerationStep[] | null
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

// Timestamp serialization functions removed - were only used for generator_steps

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
         (id, generate_type, job_json, preferences_json, personal_info_json, status, resume_url, cover_letter_url, job_match_id, created_by, steps_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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

    this.db
      .prepare(
        `UPDATE generator_requests
         SET status = ?, resume_url = ?, cover_letter_url = ?, job_match_id = ?, job_json = ?, preferences_json = ?, personal_info_json = ?, steps_json = ?, updated_at = ?
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
        new Date().toISOString(),
        id
      )

    return this.getRequest(id)
  }

  listRequests(limit = 50): GeneratorRequestRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM generator_requests
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(limit) as Array<{
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
      created_at: string
      updated_at: string
    }>

    return rows.map((row) => this.mapRequest(row))
  }

  getRequest(id: string): GeneratorRequestRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM generator_requests
         WHERE id = ?`
      )
      .get(id) as
      | {
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
          created_at: string
          updated_at: string
        }
      | undefined
    return row ? this.mapRequest(row) : null
  }

  listByStatus(status: GeneratorRequestRecord['status']): GeneratorRequestRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM generator_requests
         WHERE status = ?
         ORDER BY created_at ASC`
      )
      .all(status) as Array<{
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
      created_at: string
      updated_at: string
    }>

    return rows.map((row) => this.mapRequest(row))
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

  private mapRequest(row: {
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
    created_at: string
    updated_at: string
  }): GeneratorRequestRecord {
    return {
      id: row.id,
      generateType: row.generate_type as GeneratorRequestRecord['generateType'],
      job: JSON.parse(row.job_json),
      preferences: row.preferences_json ? JSON.parse(row.preferences_json) : null,
      personalInfo: row.personal_info_json ? (JSON.parse(row.personal_info_json) as PersonalInfo) : null,
      status: row.status as GeneratorRequestRecord['status'],
      resumeUrl: row.resume_url,
      coverLetterUrl: row.cover_letter_url,
      jobMatchId: row.job_match_id,
      createdBy: row.created_by,
      steps: row.steps_json ? (JSON.parse(row.steps_json) as GenerationStep[]) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}
