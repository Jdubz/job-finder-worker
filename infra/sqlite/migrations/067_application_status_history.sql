-- Status history: audit trail for job match status transitions
CREATE TABLE IF NOT EXISTS application_status_history (
  id TEXT PRIMARY KEY,
  job_match_id TEXT NOT NULL REFERENCES job_matches(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  application_email_id TEXT REFERENCES application_emails(id) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_status_history_match ON application_status_history(job_match_id);
