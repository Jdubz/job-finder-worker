-- Add email_ingest_state table for Gmail message deduplication and tracking
-- Per GMAIL_INGEST_PLAN.md: idempotence state for processed email messages

CREATE TABLE IF NOT EXISTS email_ingest_state (
  message_id TEXT PRIMARY KEY,
  thread_id TEXT,
  gmail_email TEXT NOT NULL,
  history_id TEXT,
  processed_at TEXT NOT NULL DEFAULT (datetime('now')),
  jobs_found INTEGER NOT NULL DEFAULT 0,
  jobs_enqueued INTEGER NOT NULL DEFAULT 0,
  error TEXT
);

-- Index for efficient lookups by gmail account
CREATE INDEX IF NOT EXISTS idx_email_ingest_state_gmail_email ON email_ingest_state(gmail_email);

-- Index for cleanup queries by processed date
CREATE INDEX IF NOT EXISTS idx_email_ingest_state_processed_at ON email_ingest_state(processed_at);
