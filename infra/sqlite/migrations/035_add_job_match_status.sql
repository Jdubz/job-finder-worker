-- Add status and ignored_at to job_matches for ignore support
-- Recreate job_matches with new columns (SQLite lacks add column with default+not null easily for existing data)
CREATE TABLE IF NOT EXISTS job_matches_new (
  id TEXT PRIMARY KEY,
  job_listing_id TEXT NOT NULL,
  match_score INTEGER NOT NULL,
  matched_skills TEXT,
  missing_skills TEXT,
  match_reasons TEXT,
  key_strengths TEXT,
  potential_concerns TEXT,
  experience_match INTEGER NOT NULL,
  customization_recommendations TEXT,
  resume_intake_json TEXT,
  analyzed_at TEXT,
  submitted_by TEXT,
  queue_item_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  ignored_at TEXT,
  FOREIGN KEY(job_listing_id) REFERENCES job_listings(id) ON DELETE CASCADE
);

-- Copy data from old table, setting status to 'active'
INSERT INTO job_matches_new (
  id, job_listing_id, match_score, matched_skills, missing_skills, match_reasons,
  key_strengths, potential_concerns, experience_match, customization_recommendations,
  resume_intake_json, analyzed_at, submitted_by, queue_item_id, created_at, updated_at,
  status, ignored_at
)
SELECT
  id, job_listing_id, match_score, matched_skills, missing_skills, match_reasons,
  key_strengths, potential_concerns, experience_match, customization_recommendations,
  resume_intake_json, analyzed_at, submitted_by, queue_item_id, created_at, updated_at,
  'active' as status, NULL as ignored_at
FROM job_matches;

DROP TABLE job_matches;
ALTER TABLE job_matches_new RENAME TO job_matches;

CREATE INDEX IF NOT EXISTS idx_job_matches_listing ON job_matches(job_listing_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_score ON job_matches(match_score);
CREATE INDEX IF NOT EXISTS idx_job_matches_status ON job_matches(status);
