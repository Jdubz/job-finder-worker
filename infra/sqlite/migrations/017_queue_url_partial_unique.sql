-- Make URL uniqueness conditional on queue item type.
-- Scrape and scrape_source items don't have meaningful URLs and shouldn't
-- be subject to deduplication. Only job, company, and source_discovery
-- items need URL uniqueness.

DROP INDEX IF EXISTS idx_job_queue_url;

-- Partial unique index: only enforce uniqueness for types with real URLs
CREATE UNIQUE INDEX idx_job_queue_url ON job_queue (url)
WHERE type IN ('job', 'company', 'source_discovery');
