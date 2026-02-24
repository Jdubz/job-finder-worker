-- Migration 048: Add case-insensitive URL index for dedup lookups
--
-- Non-unique index enables fast case-insensitive URL lookups during intake.
-- Not UNIQUE because some ATS platforms (Workday) use case-sensitive board
-- names in paths, where /Ext and /ext may be distinct boards.
-- Must be deployed AFTER running the deduplicate_listings cleanup script
-- (which resolves any existing case-insensitive URL collisions).

CREATE INDEX IF NOT EXISTS idx_job_listings_url_nocase
ON job_listings(url COLLATE NOCASE);
