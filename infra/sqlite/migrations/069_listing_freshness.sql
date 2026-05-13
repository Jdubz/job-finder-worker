-- Track when each job listing was last verified to still be live, and the
-- outcome of that verification (live / not_found / redirected / unknown).
-- Used by the freshness service to periodically re-probe matched listings
-- and auto-flip active job_matches to `ignored` when the underlying listing
-- no longer resolves. The service does not delete or archive listings; it
-- only records metadata and updates match status.

ALTER TABLE job_listings ADD COLUMN last_verified_at TEXT;
ALTER TABLE job_listings ADD COLUMN verification_status TEXT;

CREATE INDEX IF NOT EXISTS idx_job_listings_last_verified_at
  ON job_listings(last_verified_at);
