import type Database from 'better-sqlite3'
import type { UserConfigEntry } from '@shared/types'
import { getDb, checkpointWal } from '../../db/sqlite'

type UserConfigRow = {
  id: string
  user_id: string
  payload_json: string
  updated_at: string
  updated_by?: string | null
}

const UPSERT_SQL = `
  INSERT INTO user_config (id, user_id, payload_json, updated_at, updated_by)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(id, user_id) DO UPDATE SET
    payload_json = excluded.payload_json,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by
`

function mapRow<TPayload = unknown>(row: UserConfigRow): UserConfigEntry<TPayload> {
  return {
    id: row.id,
    userId: row.user_id,
    payload: JSON.parse(row.payload_json) as TPayload,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by ?? null
  }
}

export class UserConfigRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  list<TPayload = unknown>(userId: string): UserConfigEntry<TPayload>[] {
    const rows = this.db
      .prepare('SELECT id, user_id, payload_json, updated_at, updated_by FROM user_config WHERE user_id = ?')
      .all(userId) as UserConfigRow[]
    return rows.map((row) => mapRow<TPayload>(row))
  }

  get<TPayload = unknown>(userId: string, id: string): UserConfigEntry<TPayload> | null {
    checkpointWal()
    const row = this.db
      .prepare('SELECT id, user_id, payload_json, updated_at, updated_by FROM user_config WHERE id = ? AND user_id = ?')
      .get(id, userId) as UserConfigRow | undefined
    return row ? mapRow<TPayload>(row) : null
  }

  upsert<TPayload = unknown>(
    userId: string,
    id: string,
    payload: TPayload,
    meta?: { updatedBy?: string | null }
  ): UserConfigEntry<TPayload> {
    const now = new Date().toISOString()
    const serialized = payload === undefined ? null : payload
    this.db
      .prepare(UPSERT_SQL)
      .run(id, userId, JSON.stringify(serialized), now, meta?.updatedBy ?? null)
    return this.get<TPayload>(userId, id) as UserConfigEntry<TPayload>
  }
}
