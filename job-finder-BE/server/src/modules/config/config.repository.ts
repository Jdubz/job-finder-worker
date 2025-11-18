import type Database from 'better-sqlite3'
import { getDb } from '../../db/sqlite'

export interface ConfigEntry {
  id: string
  payload: unknown
  updatedAt: string
}

export class ConfigRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  list(): ConfigEntry[] {
    const rows = this.db.prepare('SELECT id, payload_json, updated_at FROM job_finder_config').all() as Array<{
      id: string
      payload_json: string
      updated_at: string
    }>

    return rows.map((row) => ({
      id: row.id,
      payload: JSON.parse(row.payload_json),
      updatedAt: row.updated_at
    }))
  }

  get(id: string): ConfigEntry | null {
    const row = this.db.prepare('SELECT id, payload_json, updated_at FROM job_finder_config WHERE id = ?').get(id) as
      | {
          id: string
          payload_json: string
          updated_at: string
        }
      | undefined

    if (!row) return null

    return {
      id: row.id,
      payload: JSON.parse(row.payload_json),
      updatedAt: row.updated_at
    }
  }

  upsert(id: string, payload: unknown): ConfigEntry {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO job_finder_config (id, payload_json, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`
      )
      .run(id, JSON.stringify(payload ?? {}), now)

    return this.get(id) as ConfigEntry
  }
}
