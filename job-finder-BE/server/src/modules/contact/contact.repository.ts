import type Database from 'better-sqlite3'
import { getDb } from '../../db/sqlite'

export interface ContactSubmission {
  id: string
  name: string
  email: string
  message: string
  metadata: Record<string, unknown>
  transaction: Record<string, unknown>
  status: 'new' | 'read' | 'replied' | 'spam'
  createdAt: string
  updatedAt: string
}

export class ContactRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  list(limit = 50): ContactSubmission[] {
    const rows = this.db.prepare('SELECT * FROM contact_submissions ORDER BY created_at DESC LIMIT ?').all(limit) as Array<{
      id: string
      name: string
      email: string
      message: string
      metadata_json: string
      transaction_json: string
      status: string
      created_at: string
      updated_at: string
    }>

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      message: row.message,
      metadata: JSON.parse(row.metadata_json),
      transaction: JSON.parse(row.transaction_json),
      status: row.status as ContactSubmission['status'],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }

  getById(id: string): ContactSubmission | null {
    const row = this.db.prepare('SELECT * FROM contact_submissions WHERE id = ?').get(id) as
      | {
          id: string
          name: string
          email: string
          message: string
          metadata_json: string
          transaction_json: string
          status: string
          created_at: string
          updated_at: string
        }
      | undefined

    if (!row) return null

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      message: row.message,
      metadata: JSON.parse(row.metadata_json),
      transaction: JSON.parse(row.transaction_json),
      status: row.status as ContactSubmission['status'],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  updateStatus(id: string, status: ContactSubmission['status']): ContactSubmission {
    const now = new Date().toISOString()
    this.db.prepare('UPDATE contact_submissions SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id)
    return this.getById(id) as ContactSubmission
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM contact_submissions WHERE id = ?').run(id)
  }
}
