-- Remove unused columns from companies and job_sources tables.
--
-- companies:
--   - tier: Was calculated by worker but never used for scheduling
--   - priority_score: Was calculated but never affected any decisions
--
-- job_sources:
--   - tier: Was intended for scheduling priority but rotation is purely chronological
--   - total_jobs_found: Was tracked but never updated after creation (latent bug)
--   - total_jobs_matched: Was tracked but never updated after creation (latent bug)
--   - validation_required: Manual validation gate removed - agent validates during discovery

-- ============================================================
-- RECREATE companies WITHOUT tier/priority_score
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
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

INSERT INTO companies_new (
    id, name, name_lower, website, about, culture, mission,
    company_size_category, industry, headquarters_location,
    has_portland_office, tech_stack, created_at, updated_at
)
SELECT
    id, name, name_lower, website, about, culture, mission,
    company_size_category, industry, headquarters_location,
    has_portland_office, tech_stack, created_at, updated_at
FROM companies;

DROP TABLE companies;
ALTER TABLE companies_new RENAME TO companies;

CREATE UNIQUE INDEX idx_companies_name_lower ON companies(name_lower);

-- ============================================================
-- RECREATE job_sources WITHOUT tier/total_jobs_*/validation_required
-- Also migrate any pending_validation sources to active
-- ============================================================

CREATE TABLE job_sources_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    source_type TEXT NOT NULL,
    status TEXT NOT NULL,
    config_json TEXT NOT NULL,
    tags TEXT,
    company_id TEXT,
    company_name TEXT,
    last_scraped_at TEXT,
    last_scraped_status TEXT,
    last_scraped_error TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    discovery_confidence TEXT,
    discovered_via TEXT,
    discovered_by TEXT,
    discovery_queue_item_id TEXT,
    health_json TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Migrate data, converting pending_validation status to active
INSERT INTO job_sources_new (
    id, name, source_type, status, config_json, tags,
    company_id, company_name, last_scraped_at, last_scraped_status,
    last_scraped_error, consecutive_failures,
    discovery_confidence, discovered_via, discovered_by,
    discovery_queue_item_id, health_json,
    created_at, updated_at
)
SELECT
    id, name, source_type,
    CASE WHEN status = 'pending_validation' THEN 'active' ELSE status END,
    config_json, tags,
    company_id, company_name, last_scraped_at, last_scraped_status,
    last_scraped_error, consecutive_failures,
    discovery_confidence, discovered_via, discovered_by,
    discovery_queue_item_id, health_json,
    created_at, updated_at
FROM job_sources;

DROP TABLE job_sources;
ALTER TABLE job_sources_new RENAME TO job_sources;

CREATE INDEX idx_job_sources_status ON job_sources(status);
CREATE INDEX idx_job_sources_company ON job_sources(company_id);
