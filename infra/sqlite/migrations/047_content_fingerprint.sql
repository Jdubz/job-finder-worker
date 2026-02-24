-- Migration 047: Add content fingerprint for content-based dedup
--
-- Catches duplicate job listings that have different URLs but identical
-- content (multi-location postings, re-scraped with rotated ATS IDs).
-- The fingerprint is SHA256(normalized_title | normalized_company | desc_prefix).

ALTER TABLE job_listings ADD COLUMN content_fingerprint TEXT;
ALTER TABLE job_listings ADD COLUMN apply_url TEXT;

-- Index for fast fingerprint lookups during intake
CREATE INDEX IF NOT EXISTS idx_job_listings_fingerprint
ON job_listings(content_fingerprint)
WHERE content_fingerprint IS NOT NULL;

-- Same columns for archive table
ALTER TABLE job_listings_archive ADD COLUMN content_fingerprint TEXT;
ALTER TABLE job_listings_archive ADD COLUMN apply_url TEXT;
