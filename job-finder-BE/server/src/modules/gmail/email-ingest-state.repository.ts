import type Database from "better-sqlite3"
import { getDb } from "../../db/sqlite"

export type EmailIngestStateRecord = {
  messageId: string
  threadId: string | null
  gmailEmail: string
  historyId: string | null
  processedAt: string
  jobsFound: number
  jobsEnqueued: number
  error: string | null
}

type EmailIngestStateRow = {
  message_id: string
  thread_id: string | null
  gmail_email: string
  history_id: string | null
  processed_at: string
  jobs_found: number
  jobs_enqueued: number
  error: string | null
}

function mapRow(row: EmailIngestStateRow): EmailIngestStateRecord {
  return {
    messageId: row.message_id,
    threadId: row.thread_id,
    gmailEmail: row.gmail_email,
    historyId: row.history_id,
    processedAt: row.processed_at,
    jobsFound: row.jobs_found,
    jobsEnqueued: row.jobs_enqueued,
    error: row.error
  }
}

export class EmailIngestStateRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  findByMessageId(messageId: string): EmailIngestStateRecord | null {
    const row = this.db
      .prepare("SELECT * FROM email_ingest_state WHERE message_id = ?")
      .get(messageId) as EmailIngestStateRow | undefined

    return row ? mapRow(row) : null
  }

  isMessageProcessed(messageId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM email_ingest_state WHERE message_id = ?")
      .get(messageId)

    return !!row
  }

  recordProcessed(params: {
    messageId: string
    threadId?: string | null
    gmailEmail: string
    historyId?: string | null
    jobsFound: number
    jobsEnqueued: number
    error?: string | null
  }): EmailIngestStateRecord {
    const now = new Date().toISOString()

    this.db
      .prepare(`
        INSERT INTO email_ingest_state (message_id, thread_id, gmail_email, history_id, processed_at, jobs_found, jobs_enqueued, error)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(message_id) DO UPDATE SET
          jobs_found = excluded.jobs_found,
          jobs_enqueued = excluded.jobs_enqueued,
          error = excluded.error,
          processed_at = excluded.processed_at
      `)
      .run(
        params.messageId,
        params.threadId ?? null,
        params.gmailEmail,
        params.historyId ?? null,
        now,
        params.jobsFound,
        params.jobsEnqueued,
        params.error ?? null
      )

    const record = this.findByMessageId(params.messageId)
    if (!record) {
      throw new Error(`Failed to retrieve record for messageId ${params.messageId} after upsert`)
    }
    return record
  }

  getLastSyncTime(gmailEmail?: string): string | null {
    const query = gmailEmail
      ? "SELECT MAX(processed_at) as last_sync FROM email_ingest_state WHERE gmail_email = ?"
      : "SELECT MAX(processed_at) as last_sync FROM email_ingest_state"

    const row = gmailEmail
      ? (this.db.prepare(query).get(gmailEmail) as { last_sync: string | null } | undefined)
      : (this.db.prepare(query).get() as { last_sync: string | null } | undefined)

    return row?.last_sync ?? null
  }

  getStats(gmailEmail?: string): { totalProcessed: number; totalJobsFound: number; totalJobsEnqueued: number } {
    const query = gmailEmail
      ? "SELECT COUNT(*) as total, SUM(jobs_found) as found, SUM(jobs_enqueued) as enqueued FROM email_ingest_state WHERE gmail_email = ?"
      : "SELECT COUNT(*) as total, SUM(jobs_found) as found, SUM(jobs_enqueued) as enqueued FROM email_ingest_state"

    const row = gmailEmail
      ? (this.db.prepare(query).get(gmailEmail) as { total: number; found: number | null; enqueued: number | null })
      : (this.db.prepare(query).get() as { total: number; found: number | null; enqueued: number | null })

    return {
      totalProcessed: row?.total ?? 0,
      totalJobsFound: row?.found ?? 0,
      totalJobsEnqueued: row?.enqueued ?? 0
    }
  }

  pruneOlderThan(days: number): number {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)

    const result = this.db
      .prepare("DELETE FROM email_ingest_state WHERE processed_at < ?")
      .run(cutoff.toISOString())

    return result.changes
  }
}
