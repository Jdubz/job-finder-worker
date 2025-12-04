-- Migration: Drop application_priority column from job_matches
-- The deterministic match_score now serves as the priority indicator.
-- Priority thresholds can be applied at query time if needed.

-- Drop the index first
DROP INDEX IF EXISTS idx_job_matches_priority;

-- SQLite 3.35.0+ supports ALTER TABLE DROP COLUMN
-- For older versions, we'd need to recreate the table
ALTER TABLE job_matches DROP COLUMN application_priority;
