-- Migration: Create job_listings table and refactor job_matches
--
-- This migration:
-- 1. Creates the job_listings table to store raw job data
-- 2. Recreates job_matches to store only analysis results (no data to preserve)
--
-- The job_listings table becomes the source of truth for:
-- - Job deduplication (URL uniqueness)
-- - Tracking all jobs that pass pre-filter (regardless of AI analysis outcome)
-- - Linking to source and company

-- =============================================================================
-- STEP 1: Create job_listings table
-- =============================================================================

CREATE TABLE IF NOT EXISTS job_listings (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  source_id TEXT REFERENCES job_sources(id) ON DELETE SET NULL,
  company_id TEXT REFERENCES companies(id) ON DELETE SET NULL,

  -- Listing data (from scraper)
  title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  location TEXT,
  salary_range TEXT,
  description TEXT NOT NULL,
  posted_date TEXT,

  -- Metadata
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filtered', 'analyzing', 'analyzed', 'skipped')),
  filter_result TEXT,  -- JSON if filtered out

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_listings_source ON job_listings(source_id);
CREATE INDEX IF NOT EXISTS idx_job_listings_company ON job_listings(company_id);
CREATE INDEX IF NOT EXISTS idx_job_listings_status ON job_listings(status);
CREATE INDEX IF NOT EXISTS idx_job_listings_created ON job_listings(created_at);

-- =============================================================================
-- STEP 2: Drop and recreate job_matches with new schema
-- (No data to preserve per user confirmation)
-- =============================================================================

DROP TABLE IF EXISTS job_matches;

CREATE TABLE job_matches (
  id TEXT PRIMARY KEY,
  job_listing_id TEXT NOT NULL REFERENCES job_listings(id) ON DELETE CASCADE,

  -- Analysis results only
  match_score REAL NOT NULL,
  matched_skills TEXT,        -- JSON array
  missing_skills TEXT,        -- JSON array
  match_reasons TEXT,         -- JSON array
  key_strengths TEXT,         -- JSON array
  potential_concerns TEXT,    -- JSON array
  experience_match REAL,
  application_priority TEXT NOT NULL CHECK (application_priority IN ('High','Medium','Low')),
  customization_recommendations TEXT,  -- JSON array
  resume_intake_json TEXT,    -- JSON object

  -- Metadata
  analyzed_at TEXT,
  submitted_by TEXT,
  queue_item_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_matches_listing ON job_matches(job_listing_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_priority ON job_matches(application_priority);
CREATE INDEX IF NOT EXISTS idx_job_matches_score ON job_matches(match_score);
