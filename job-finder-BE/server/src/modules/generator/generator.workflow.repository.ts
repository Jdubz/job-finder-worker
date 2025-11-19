import type Database from 'better-sqlite3'
import type { PersonalInfo } from '@shared/types'
import { getDb } from '../../db/sqlite'
import type { GenerationStep } from './workflow/generation-steps'

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

export class GeneratorWorkflowRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  createRequest(record: Omit<GeneratorRequestRecord, 'createdAt' | 'updatedAt'>): GeneratorRequestRecord {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO generator_requests
         (id, generate_type, job_json, preferences_json, personal_info_json, status, resume_url, cover_letter_url, job_match_id, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
    const mergedPrefs =
      updates.preferences !== undefined
        ? updates.preferences
          ? JSON.stringify(updates.preferences)
          : null
        : existing.preferences
        ? JSON.stringify(existing.preferences)
        : null
    const mergedPersonal =
      updates.personalInfo !== undefined
        ? updates.personalInfo
          ? JSON.stringify(updates.personalInfo)
          : null
        : existing.personalInfo
        ? JSON.stringify(existing.personalInfo)
        : null

    this.db
      .prepare(
        `UPDATE generator_requests
         SET status = ?, resume_url = ?, cover_letter_url = ?, job_match_id = ?, job_json = ?, preferences_json = ?, personal_info_json = ?, updated_at = ?
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
          created_at: string
          updated_at: string
        }
      | undefined
    return row ? this.mapRequest(row) : null
  }

  saveSteps(requestId: string, steps: GenerationStep[]): void {
    const tx = this.db.transaction((items: GenerationStep[]) => {
      this.db.prepare('DELETE FROM generator_steps WHERE request_id = ?').run(requestId)
      const insert = this.db.prepare(
        `INSERT INTO generator_steps
         (id, request_id, name, description, status, started_at, completed_at, duration_ms, result_json, error_json, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      items.forEach((step, index) => {
        insert.run(
          step.id,
          requestId,
          step.name,
          step.description ?? '',
          step.status,
          step.startedAt ?? null,
          step.completedAt ?? null,
          step.duration ?? null,
          step.result ? JSON.stringify(step.result) : null,
          step.error ? JSON.stringify(step.error) : null,
          index
        )
      })
    })
    tx(steps)
  }

  listSteps(requestId: string): GenerationStep[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM generator_steps
         WHERE request_id = ?
         ORDER BY position ASC`
      )
      .all(requestId) as Array<{
      id: string
      name: string
      description: string | null
      status: string
      started_at: string | null
      completed_at: string | null
      duration_ms: number | null
      result_json: string | null
      error_json: string | null
      position: number
    }>

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      status: row.status as GenerationStep['status'],
      startedAt: row.started_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      duration: row.duration_ms ?? undefined,
      result: row.result_json ? (JSON.parse(row.result_json) as Record<string, unknown>) : undefined,
      error: row.error_json ? (JSON.parse(row.error_json) as Record<string, unknown>) : undefined
    }))
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
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }
}
