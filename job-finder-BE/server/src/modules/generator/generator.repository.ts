import type Database from 'better-sqlite3'
import type { GeneratorDocumentRecord } from '@shared/types'
import { getDb } from '../../db/sqlite'

export class GeneratorRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  list(type?: string): GeneratorDocumentRecord[] {
    const sql = type
      ? 'SELECT * FROM generator_documents WHERE document_type = ? ORDER BY created_at DESC'
      : 'SELECT * FROM generator_documents ORDER BY created_at DESC'
    const rows = type
      ? (this.db.prepare(sql).all(type) as Array<{
          id: string
          document_type: string
          payload_json: string
          created_at: string
          updated_at: string
        }>)
      : (this.db.prepare(sql).all() as Array<{
          id: string
          document_type: string
          payload_json: string
          created_at: string
          updated_at: string
        }>)

    return rows.map((row) => ({
      id: row.id,
      documentType: row.document_type,
      payload: JSON.parse(row.payload_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }

  get(id: string): GeneratorDocumentRecord | null {
    const row = this.db.prepare('SELECT * FROM generator_documents WHERE id = ?').get(id) as
      | {
          id: string
          document_type: string
          payload_json: string
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) return null

    return {
      id: row.id,
      documentType: row.document_type,
      payload: JSON.parse(row.payload_json),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  save(id: string, documentType: string, payload: unknown): GeneratorDocumentRecord {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO generator_documents (id, document_type, payload_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET document_type = excluded.document_type, payload_json = excluded.payload_json, updated_at = excluded.updated_at`
      )
      .run(id, documentType, JSON.stringify(payload ?? {}), now, now)

    return this.get(id) as GeneratorDocumentRecord
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM generator_documents WHERE id = ?').run(id)
  }
}
