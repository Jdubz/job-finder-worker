-- Remove analysis_status column from companies table.
-- Company readiness is now determined by data completeness (has_good_company_data),
-- not by a separate status field.

-- SQLite doesn't support DROP COLUMN directly in older versions,
-- so we need to recreate the table.

-- Create new table without analysis_status
CREATE TABLE companies_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_lower TEXT NOT NULL,
    website TEXT,
    about TEXT,
    culture TEXT,
    mission TEXT,
    size TEXT,
    company_size_category TEXT,
    founded TEXT,
    industry TEXT,
    headquarters_location TEXT,
    has_portland_office INTEGER DEFAULT 0,
    tech_stack TEXT,
    tier TEXT,
    priority_score INTEGER,
    analysis_progress TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Copy data (excluding analysis_status)
INSERT INTO companies_new (
    id, name, name_lower, website, about, culture, mission, size,
    company_size_category, founded, industry, headquarters_location,
    has_portland_office, tech_stack, tier, priority_score, analysis_progress,
    created_at, updated_at
)
SELECT
    id, name, name_lower, website, about, culture, mission, size,
    company_size_category, founded, industry, headquarters_location,
    has_portland_office, tech_stack, tier, priority_score, analysis_progress,
    created_at, updated_at
FROM companies;

-- Drop old table and rename new one
DROP TABLE companies;
ALTER TABLE companies_new RENAME TO companies;

-- Recreate indexes
CREATE UNIQUE INDEX idx_companies_name_lower ON companies(name_lower);
