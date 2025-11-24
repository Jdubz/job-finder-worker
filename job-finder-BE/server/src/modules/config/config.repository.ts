import type Database from 'better-sqlite3'
import type { JobFinderConfigEntry } from '@shared/types'
import { getDb } from '../../db/sqlite'

type ConfigRow = {
  id: string
  payload_json: string
  updated_at: string
  name?: string | null
  updated_by?: string | null
}

const UPSERT_SQL = `
  INSERT INTO job_finder_config (id, payload_json, updated_at, name, updated_by)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    payload_json = excluded.payload_json,
    updated_at = excluded.updated_at,
    name = excluded.name,
    updated_by = excluded.updated_by
`

function mapRow<TPayload = unknown>(row: ConfigRow): JobFinderConfigEntry<TPayload> {
  return {
    id: row.id,
    payload: JSON.parse(row.payload_json) as TPayload,
    updatedAt: row.updated_at,
    name: row.name ?? null,
    updatedBy: row.updated_by ?? null
  }
}

export class ConfigRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  list<TPayload = unknown>(): JobFinderConfigEntry<TPayload>[] {
    const rows = this.db
      .prepare('SELECT id, payload_json, updated_at, name, updated_by FROM job_finder_config')
      .all() as ConfigRow[]

    return rows.map((row) => mapRow<TPayload>(row))
  }

  get<TPayload = unknown>(id: string): JobFinderConfigEntry<TPayload> | null {
    const row = this.db
      .prepare('SELECT id, payload_json, updated_at, name, updated_by FROM job_finder_config WHERE id = ?')
      .get(id) as ConfigRow | undefined

    return row ? mapRow<TPayload>(row) : null
  }

  upsert<TPayload = unknown>(
    id: string,
    payload: TPayload,
    meta?: { name?: string | null; updatedBy?: string | null }
  ): JobFinderConfigEntry<TPayload> {
    const now = new Date().toISOString()
    const serialized = payload === undefined ? null : payload
    this.db
      .prepare(UPSERT_SQL)
      .run(id, JSON.stringify(serialized), now, meta?.name ?? null, meta?.updatedBy ?? null)

    return this.get<TPayload>(id) as JobFinderConfigEntry<TPayload>
  }
}
