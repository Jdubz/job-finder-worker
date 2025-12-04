-- Remove unused columns from job_queue and companies tables.
-- This migration simplifies the schema by removing:
--
-- job_queue:
--   - retry_count, max_retries: Retry logic is disabled, always 0
--   - sub_task: Never used for JOB items (only company_sub_task is used)
--   - pipeline_stage: Display only, routing uses pipeline_state dict
--   - ancestry_chain, spawn_depth, max_spawn_depth: Redundant spawn prevention
--
-- companies:
--   - size: Duplicate of company_size_category
--   - analysis_progress: Vestigial - readiness is determined by has_good_company_data()
--   - founded: Written but never queried or displayed

-- ============================================================
-- RECREATE job_queue WITHOUT UNUSED COLUMNS
-- ============================================================

-- Drop view that depends on job_queue first
DROP VIEW IF EXISTS view_queue_ready;

CREATE TABLE job_queue_new (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    url TEXT NOT NULL DEFAULT '',
    company_name TEXT NOT NULL DEFAULT '',
    company_id TEXT,
    source TEXT DEFAULT 'scraper',
    submitted_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    processed_at TEXT,
    completed_at TEXT,
    scraped_data TEXT,
    scrape_config TEXT,
    source_discovery_config TEXT,
    source_id TEXT,
    source_type TEXT,
    source_config TEXT,
    source_tier TEXT,
    pipeline_state TEXT,
    parent_item_id TEXT,
    company_sub_task TEXT,
    tracking_id TEXT,
    result_message TEXT,
    error_details TEXT,
    metadata TEXT
);

-- Copy data (excluding removed columns)
INSERT INTO job_queue_new (
    id, type, status, url, company_name, company_id, source, submitted_by,
    created_at, updated_at, processed_at, completed_at,
    scraped_data, scrape_config, source_discovery_config,
    source_id, source_type, source_config, source_tier,
    pipeline_state, parent_item_id, company_sub_task, tracking_id,
    result_message, error_details, metadata
)
SELECT
    id, type, status, url, company_name, company_id, source, submitted_by,
    created_at, updated_at, processed_at, completed_at,
    scraped_data, scrape_config, source_discovery_config,
    source_id, source_type, source_config, source_tier,
    pipeline_state, parent_item_id, company_sub_task, tracking_id,
    result_message, error_details, metadata
FROM job_queue;

-- Drop old table and rename
DROP TABLE job_queue;
ALTER TABLE job_queue_new RENAME TO job_queue;

-- Recreate indexes
CREATE INDEX idx_job_queue_status ON job_queue(status);
CREATE INDEX idx_job_queue_type ON job_queue(type);
CREATE INDEX idx_job_queue_created_at ON job_queue(created_at);
CREATE INDEX idx_job_queue_tracking_id ON job_queue(tracking_id);

-- Partial unique index for active items only (from migration 018)
CREATE UNIQUE INDEX idx_job_queue_url ON job_queue (url)
WHERE type IN ('job', 'company', 'source_discovery')
  AND status IN ('pending', 'processing');

-- Recreate the view
CREATE VIEW IF NOT EXISTS view_queue_ready AS
SELECT id, url, company_name, status
FROM job_queue
WHERE status = 'pending'
ORDER BY created_at ASC;

-- ============================================================
-- RECREATE companies WITHOUT UNUSED COLUMNS
-- ============================================================

CREATE TABLE companies_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_lower TEXT NOT NULL,
    website TEXT,
    about TEXT,
    culture TEXT,
    mission TEXT,
    company_size_category TEXT,
    industry TEXT,
    headquarters_location TEXT,
    has_portland_office INTEGER DEFAULT 0,
    tech_stack TEXT,
    tier TEXT,
    priority_score INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Copy data (excluding size, analysis_progress, founded)
INSERT INTO companies_new (
    id, name, name_lower, website, about, culture, mission,
    company_size_category, industry, headquarters_location,
    has_portland_office, tech_stack, tier, priority_score,
    created_at, updated_at
)
SELECT
    id, name, name_lower, website, about, culture, mission,
    company_size_category, industry, headquarters_location,
    has_portland_office, tech_stack, tier, priority_score,
    created_at, updated_at
FROM companies;

-- Drop old table and rename
DROP TABLE companies;
ALTER TABLE companies_new RENAME TO companies;

-- Recreate indexes
CREATE UNIQUE INDEX idx_companies_name_lower ON companies(name_lower);
