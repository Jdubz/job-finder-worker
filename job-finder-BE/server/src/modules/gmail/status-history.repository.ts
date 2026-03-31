import { randomUUID } from "node:crypto"
import type Database from "better-sqlite3"
import type { ApplicationStatusHistory, JobMatchStatus } from "@shared/types"
import { getDb } from "../../db/sqlite"

type StatusHistoryRow = {
  id: string
  job_match_id: string
  from_status: string
  to_status: string
  changed_by: string
  application_email_id: string | null
  note: string | null
  created_at: string
}

function mapRow(row: StatusHistoryRow): ApplicationStatusHistory {
  return {
    id: row.id,
    jobMatchId: row.job_match_id,
    fromStatus: row.from_status as JobMatchStatus,
    toStatus: row.to_status as JobMatchStatus,
    changedBy: row.changed_by as "user" | "email_tracker",
    applicationEmailId: row.application_email_id,
    note: row.note,
    createdAt: new Date(row.created_at)
  }
}

export interface RecordStatusChangeInput {
  jobMatchId: string
  fromStatus: JobMatchStatus
  toStatus: JobMatchStatus
  changedBy: "user" | "email_tracker"
  applicationEmailId?: string | null
  note?: string | null
}

export class StatusHistoryRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  record(input: RecordStatusChangeInput): ApplicationStatusHistory {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO application_status_history (
        id, job_match_id, from_status, to_status, changed_by, application_email_id, note, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.jobMatchId,
      input.fromStatus,
      input.toStatus,
      input.changedBy,
      input.applicationEmailId ?? null,
      input.note ?? null,
      now
    )

    return this.getById(id)!
  }

  getById(id: string): ApplicationStatusHistory | null {
    const row = this.db
      .prepare("SELECT * FROM application_status_history WHERE id = ?")
      .get(id) as StatusHistoryRow | undefined
    return row ? mapRow(row) : null
  }

  listByJobMatch(matchId: string): ApplicationStatusHistory[] {
    const rows = this.db
      .prepare("SELECT * FROM application_status_history WHERE job_match_id = ? ORDER BY created_at ASC")
      .all(matchId) as StatusHistoryRow[]
    return rows.map(mapRow)
  }
}
