-- Add `static_score` to job_matches: the deterministic match score WITHOUT the
-- freshness component. The API computes freshness adjustments live from
-- job_listings.posted_date / created_at so an aging listing decays toward the
-- staleScore without requiring a periodic re-score job.
--
-- NULL for legacy rows scored before this migration; the API falls back to
-- the stored match_score when static_score is missing.

ALTER TABLE job_matches ADD COLUMN static_score INTEGER;
