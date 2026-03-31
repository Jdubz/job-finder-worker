-- Application emails: tracks emails matched to job applications
CREATE TABLE IF NOT EXISTS application_emails (
  id TEXT PRIMARY KEY,
  job_match_id TEXT REFERENCES job_matches(id) ON DELETE SET NULL,
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT,
  gmail_email TEXT NOT NULL,

  -- Email metadata
  sender TEXT NOT NULL,
  sender_domain TEXT,
  subject TEXT,
  received_at TEXT NOT NULL,
  snippet TEXT,
  body_preview TEXT,

  -- Classification
  classification TEXT NOT NULL DEFAULT 'unclassified',
  classification_confidence INTEGER NOT NULL DEFAULT 0,

  -- Match linking
  match_confidence INTEGER,
  match_signals TEXT,
  auto_linked INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  processed_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_app_emails_match ON application_emails(job_match_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_emails_gmail_msg ON application_emails(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_app_emails_domain ON application_emails(sender_domain);
CREATE INDEX IF NOT EXISTS idx_app_emails_classification ON application_emails(classification);
