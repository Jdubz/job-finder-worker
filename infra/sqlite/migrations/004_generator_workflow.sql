-- Generator workflow persistence tables

CREATE TABLE IF NOT EXISTS generator_requests (
  id TEXT PRIMARY KEY,
  generate_type TEXT NOT NULL CHECK (generate_type IN ('resume','coverLetter','both')),
  job_json TEXT NOT NULL,
  preferences_json TEXT,
  personal_info_json TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','completed','failed')),
  resume_url TEXT,
  cover_letter_url TEXT,
  job_match_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generator_requests_status ON generator_requests (status);
CREATE INDEX IF NOT EXISTS idx_generator_requests_created_at ON generator_requests (created_at DESC);

CREATE TABLE IF NOT EXISTS generator_steps (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES generator_requests(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','in_progress','completed','failed','skipped')),
  started_at TEXT,
  completed_at TEXT,
  duration_ms INTEGER,
  result_json TEXT,
  error_json TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_generator_steps_request ON generator_steps (request_id, position);

CREATE TABLE IF NOT EXISTS generator_artifacts (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES generator_requests(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  size_bytes INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_generator_artifacts_request ON generator_artifacts (request_id);
CREATE INDEX IF NOT EXISTS idx_generator_artifacts_type ON generator_artifacts (artifact_type);
