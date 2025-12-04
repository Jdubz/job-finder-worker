-- Drop the redundant company_name column from job_sources
-- Company info should be accessed via the company_id FK and JOIN to companies table
-- Aggregator sources use aggregator_domain to indicate they're not company-specific

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- Create new table without company_name
CREATE TABLE job_sources_new (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL,
  config_json TEXT NOT NULL,
  tags TEXT,
  company_id TEXT,
  aggregator_domain TEXT,
  last_scraped_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Copy data (excluding company_name)
INSERT INTO job_sources_new (
  id, name, source_type, status, config_json, tags, company_id, aggregator_domain,
  last_scraped_at, created_at, updated_at
)
SELECT
  id, name, source_type, status, config_json, tags, company_id, aggregator_domain,
  last_scraped_at, created_at, updated_at
FROM job_sources;

-- Drop old table
DROP TABLE job_sources;

-- Rename new table
ALTER TABLE job_sources_new RENAME TO job_sources;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_job_sources_status ON job_sources (status);
CREATE INDEX IF NOT EXISTS idx_job_sources_company ON job_sources (company_id);
CREATE INDEX IF NOT EXISTS idx_job_sources_aggregator_domain ON job_sources (aggregator_domain) WHERE aggregator_domain IS NOT NULL;
