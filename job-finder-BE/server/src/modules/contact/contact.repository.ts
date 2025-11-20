import type Database from 'better-sqlite3'
import type {
  ContactSubmission,
  ContactSubmissionStatus,
  ContactSubmissionMetadata,
  ContactSubmissionTransaction
} from '@shared/types'
import { getDb } from '../../db/sqlite'

type ContactRow = {
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

const DEFAULT_METADATA: ContactSubmissionMetadata = {
  timestamp: new Date(0).toISOString(),
  ip: 'unknown',
  userAgent: 'unknown'
}

function parseMetadata(json: string): ContactSubmissionMetadata {
  try {
    const value = JSON.parse(json) ?? {}
    return {
      timestamp: typeof value.timestamp === 'string' ? value.timestamp : DEFAULT_METADATA.timestamp,
      ip: typeof value.ip === 'string' ? value.ip : DEFAULT_METADATA.ip,
      userAgent: typeof value.userAgent === 'string' ? value.userAgent : DEFAULT_METADATA.userAgent,
      ...(typeof value.referrer === 'string' ? { referrer: value.referrer } : {})
    }
  } catch {
    return DEFAULT_METADATA
  }
}

function parseTransaction(json: string): ContactSubmissionTransaction | undefined {
  if (!json) return undefined
  try {
    const value = JSON.parse(json)
    return value ?? undefined
  } catch {
    return undefined
  }
}

function mapRow(row: ContactRow): ContactSubmission {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    message: row.message,
    metadata: parseMetadata(row.metadata_json),
    transaction: parseTransaction(row.transaction_json),
    status: row.status as ContactSubmissionStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class ContactRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  list(limit = 50): ContactSubmission[] {
    const rows = this.db
      .prepare('SELECT * FROM contact_submissions ORDER BY created_at DESC LIMIT ?')
      .all(limit) as ContactRow[]

    return rows.map(mapRow)
  }

  getById(id: string): ContactSubmission | null {
    const row = this.db
      .prepare('SELECT * FROM contact_submissions WHERE id = ?')
      .get(id) as ContactRow | undefined

    return row ? mapRow(row) : null
  }

  updateStatus(id: string, status: ContactSubmissionStatus): ContactSubmission {
    const now = new Date().toISOString()
    this.db.prepare('UPDATE contact_submissions SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id)
    return this.getById(id) as ContactSubmission
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM contact_submissions WHERE id = ?').run(id)
  }
}
