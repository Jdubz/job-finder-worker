-- Migration: Add match_score column to job_listings for quick filtering/sorting
--
-- The analysis_result JSON contains the full scoring data, but having a dedicated
-- match_score column allows for efficient querying, sorting, and display.

ALTER TABLE job_listings
ADD COLUMN match_score REAL; -- Score from 0-100, NULL if not yet analyzed

CREATE INDEX IF NOT EXISTS idx_job_listings_match_score ON job_listings(match_score);
