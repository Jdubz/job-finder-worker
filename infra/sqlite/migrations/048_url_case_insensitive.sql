-- Migration 048: Add case-insensitive URL uniqueness safety net
--
-- Python code now lowercases URL paths during normalization, but this index
-- serves as a database-level guard against case-only URL duplicates.
-- Must be deployed AFTER running the deduplicate_listings cleanup script
-- (which resolves any existing case-insensitive URL collisions).

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_listings_url_nocase
ON job_listings(url COLLATE NOCASE);
