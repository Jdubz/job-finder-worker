-- Migration: allow 'matched' status for job_listings

-- SQLite doesn't support altering CHECK directly; recreate table with new constraint

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

  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','filtered','analyzing','analyzed','skipped','matched')),
  filter_result TEXT,
  analysis_result TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO job_listings_new (
  id, url, source_id, company_id, title, company_name, location, salary_range, description,
  posted_date, status, filter_result, analysis_result, created_at, updated_at
)
SELECT id, url, source_id, company_id, title, company_name, location, salary_range, description,
       posted_date, status, filter_result, analysis_result, created_at, updated_at
FROM job_listings;

DROP TABLE job_listings;
ALTER TABLE job_listings_new RENAME TO job_listings;

CREATE INDEX IF NOT EXISTS idx_job_listings_source ON job_listings(source_id);
CREATE INDEX IF NOT EXISTS idx_job_listings_company ON job_listings(company_id);
CREATE INDEX IF NOT EXISTS idx_job_listings_status ON job_listings(status);
CREATE INDEX IF NOT EXISTS idx_job_listings_created ON job_listings(created_at);

PRAGMA foreign_keys=on;

