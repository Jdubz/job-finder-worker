-- Migration: Drop analysis_result column from job_listings
-- Analysis data is stored in job_matches table only (single source of truth).
-- This eliminates redundant storage of the same data.

-- SQLite 3.35.0+ supports ALTER TABLE DROP COLUMN
ALTER TABLE job_listings DROP COLUMN analysis_result;
