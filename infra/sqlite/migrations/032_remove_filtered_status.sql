-- Migration: Remove deprecated 'filtered' status from job_listings
--
-- The 'filtered' status is no longer used - jobs that fail prefilter are never
-- created as listings in the first place. Filtering happens at intake before
-- listing creation.
--
-- SQLite doesn't support altering CHECK constraints directly; must recreate table.

PRAGMA foreign_keys=off;

CREATE TABLE job_listings_new (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  source_id TEXT REFERENCES job_sources(id) ON DELETE SET NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  location TEXT,
  salary_range TEXT,
  description TEXT NOT NULL,
  posted_date TEXT,

  -- Removed 'filtered' from CHECK constraint
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','analyzing','analyzed','skipped','matched')),
  filter_result TEXT,
  analysis_result TEXT,
  match_score REAL,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Copy data, converting any 'filtered' rows to 'skipped' (shouldn't exist, but safety)
INSERT INTO job_listings_new (
  id, url, source_id, company_id, title, company_name, location, salary_range, description,
  posted_date, status, filter_result, analysis_result, match_score, created_at, updated_at
)
SELECT
  id, url, source_id, company_id, title, company_name, location, salary_range, description,
  posted_date,
  CASE WHEN status = 'filtered' THEN 'skipped' ELSE status END,
  filter_result, analysis_result, match_score, created_at, updated_at
FROM job_listings;

DROP TABLE job_listings;
ALTER TABLE job_listings_new RENAME TO job_listings;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_job_listings_source ON job_listings(source_id);
CREATE INDEX IF NOT EXISTS idx_job_listings_company ON job_listings(company_id);
CREATE INDEX IF NOT EXISTS idx_job_listings_status ON job_listings(status);
CREATE INDEX IF NOT EXISTS idx_job_listings_created ON job_listings(created_at);
CREATE INDEX IF NOT EXISTS idx_job_listings_match_score ON job_listings(match_score);

PRAGMA foreign_keys=on;
