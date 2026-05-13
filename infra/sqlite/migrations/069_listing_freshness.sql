-- Track when each job listing was last verified to still be live.
-- Used by the freshness service to periodically re-check matched listings
-- and auto-archive ones whose URLs no longer resolve.

ALTER TABLE job_listings ADD COLUMN last_verified_at TEXT;
ALTER TABLE job_listings ADD COLUMN verification_status TEXT;

CREATE INDEX IF NOT EXISTS idx_job_listings_last_verified_at
  ON job_listings(last_verified_at);
