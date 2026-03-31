import { randomUUID } from "node:crypto"
import type Database from "better-sqlite3"
import type { ApplicationEmail, EmailClassification, MatchSignals } from "@shared/types"
import { getDb } from "../../db/sqlite"

type ApplicationEmailRow = {
  id: string
  job_match_id: string | null
  gmail_message_id: string
  gmail_thread_id: string | null
  gmail_email: string
  sender: string
  sender_domain: string | null
  subject: string | null
  received_at: string
  snippet: string | null
  body_preview: string | null
  classification: string
  classification_confidence: number
  match_confidence: number | null
  match_signals: string | null
  auto_linked: number
  processed_at: string
  created_at: string
  updated_at: string
}

function mapRow(row: ApplicationEmailRow): ApplicationEmail {
  return {
    id: row.id,
    jobMatchId: row.job_match_id,
    gmailMessageId: row.gmail_message_id,
    gmailThreadId: row.gmail_thread_id,
    gmailEmail: row.gmail_email,
    sender: row.sender,
    senderDomain: row.sender_domain,
    subject: row.subject,
    receivedAt: new Date(row.received_at),
    snippet: row.snippet,
    bodyPreview: row.body_preview,
    classification: row.classification as EmailClassification,
    classificationConfidence: row.classification_confidence,
    matchConfidence: row.match_confidence,
    matchSignals: row.match_signals ? JSON.parse(row.match_signals) : null,
    autoLinked: Boolean(row.auto_linked),
    processedAt: new Date(row.processed_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at)
  }
}

export interface CreateApplicationEmailInput {
  jobMatchId?: string | null
  gmailMessageId: string
  gmailThreadId?: string | null
  gmailEmail: string
  sender: string
  senderDomain?: string | null
  subject?: string | null
  receivedAt: string
  snippet?: string | null
  bodyPreview?: string | null
  classification: EmailClassification
  classificationConfidence: number
  matchConfidence?: number | null
  matchSignals?: MatchSignals | null
  autoLinked: boolean
}

export class ApplicationEmailRepository {
  private db: Database.Database

  constructor() {
    this.db = getDb()
  }

  create(input: CreateApplicationEmailInput): ApplicationEmail {
    const id = randomUUID()
    const now = new Date().toISOString()

    this.db.prepare(`
      INSERT INTO application_emails (
        id, job_match_id, gmail_message_id, gmail_thread_id, gmail_email,
        sender, sender_domain, subject, received_at, snippet, body_preview,
        classification, classification_confidence,
        match_confidence, match_signals, auto_linked,
        processed_at, created_at, updated_at
      ) VALUES (
        @id, @jobMatchId, @gmailMessageId, @gmailThreadId, @gmailEmail,
        @sender, @senderDomain, @subject, @receivedAt, @snippet, @bodyPreview,
        @classification, @classificationConfidence,
        @matchConfidence, @matchSignals, @autoLinked,
        @now, @now, @now
      )
    `).run({
      id,
      jobMatchId: input.jobMatchId ?? null,
      gmailMessageId: input.gmailMessageId,
      gmailThreadId: input.gmailThreadId ?? null,
      gmailEmail: input.gmailEmail,
      sender: input.sender,
      senderDomain: input.senderDomain ?? null,
      subject: input.subject ?? null,
      receivedAt: input.receivedAt,
      snippet: input.snippet ?? null,
      bodyPreview: input.bodyPreview ?? null,
      classification: input.classification,
      classificationConfidence: input.classificationConfidence,
      matchConfidence: input.matchConfidence ?? null,
      matchSignals: input.matchSignals ? JSON.stringify(input.matchSignals) : null,
      autoLinked: input.autoLinked ? 1 : 0,
      now
    })

    return this.getById(id)!
  }

  getById(id: string): ApplicationEmail | null {
    const row = this.db
      .prepare("SELECT * FROM application_emails WHERE id = ?")
      .get(id) as ApplicationEmailRow | undefined
    return row ? mapRow(row) : null
  }

  getByGmailMessageId(gmailEmail: string, messageId: string): ApplicationEmail | null {
    const row = this.db
      .prepare("SELECT * FROM application_emails WHERE gmail_email = ? AND gmail_message_id = ?")
      .get(gmailEmail, messageId) as ApplicationEmailRow | undefined
    return row ? mapRow(row) : null
  }

  listByJobMatch(matchId: string): ApplicationEmail[] {
    const rows = this.db
      .prepare("SELECT * FROM application_emails WHERE job_match_id = ? ORDER BY received_at DESC")
      .all(matchId) as ApplicationEmailRow[]
    return rows.map(mapRow)
  }

  listUnlinked(): ApplicationEmail[] {
    const rows = this.db
      .prepare("SELECT * FROM application_emails WHERE job_match_id IS NULL ORDER BY received_at DESC")
      .all() as ApplicationEmailRow[]
    return rows.map(mapRow)
  }

  listAll(options?: { limit?: number; offset?: number }): ApplicationEmail[] {
    const limit = options?.limit ?? 100
    const offset = options?.offset ?? 0
    const rows = this.db
      .prepare("SELECT * FROM application_emails ORDER BY received_at DESC LIMIT ? OFFSET ?")
      .all(limit, offset) as ApplicationEmailRow[]
    return rows.map(mapRow)
  }

  linkToMatch(emailId: string, matchId: string): ApplicationEmail | null {
    const now = new Date().toISOString()
    this.db
      .prepare("UPDATE application_emails SET job_match_id = ?, updated_at = ? WHERE id = ?")
      .run(matchId, now, emailId)
    return this.getById(emailId)
  }

  unlinkFromMatch(emailId: string): ApplicationEmail | null {
    const now = new Date().toISOString()
    this.db
      .prepare("UPDATE application_emails SET job_match_id = NULL, updated_at = ? WHERE id = ?")
      .run(now, emailId)
    return this.getById(emailId)
  }

  updateClassification(emailId: string, classification: EmailClassification, confidence: number): void {
    const now = new Date().toISOString()
    this.db
      .prepare("UPDATE application_emails SET classification = ?, classification_confidence = ?, updated_at = ? WHERE id = ?")
      .run(classification, confidence, now, emailId)
  }

  isProcessed(gmailEmail: string, gmailMessageId: string): boolean {
    const row = this.db
      .prepare("SELECT 1 FROM application_emails WHERE gmail_email = ? AND gmail_message_id = ?")
      .get(gmailEmail, gmailMessageId)
    return Boolean(row)
  }
}
