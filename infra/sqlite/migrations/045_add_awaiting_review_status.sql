-- Add 'awaiting_review' status to generator_requests table
-- Required for the review step in the resume/cover letter generation workflow
-- Note: generator_steps was dropped in migration 011, only generator_artifacts has FK to this table

PRAGMA foreign_keys=off;

BEGIN TRANSACTION;

CREATE TABLE generator_requests_new (
  id TEXT PRIMARY KEY,
  generate_type TEXT NOT NULL CHECK (generate_type IN ('resume','coverLetter','both')),
  job_json TEXT NOT NULL,
  preferences_json TEXT,
  personal_info_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','awaiting_review','completed','failed')),
  resume_url TEXT,
  cover_letter_url TEXT,
  job_match_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  steps_json TEXT,
  intermediate_results_json TEXT
);

INSERT INTO generator_requests_new (
  id, generate_type, job_json, preferences_json, personal_info_json,
  status, resume_url, cover_letter_url, job_match_id, created_by,
  created_at, updated_at, steps_json, intermediate_results_json
)
SELECT
  id, generate_type, job_json, preferences_json, personal_info_json,
  status, resume_url, cover_letter_url, job_match_id, created_by,
  created_at, updated_at, steps_json, intermediate_results_json
FROM generator_requests;

DROP TABLE generator_requests;
ALTER TABLE generator_requests_new RENAME TO generator_requests;

CREATE INDEX IF NOT EXISTS idx_generator_requests_status ON generator_requests (status);
CREATE INDEX IF NOT EXISTS idx_generator_requests_created_at ON generator_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generator_requests_job_match_id ON generator_requests (job_match_id);

COMMIT;

PRAGMA foreign_keys=on;
