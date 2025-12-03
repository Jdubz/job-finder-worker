-- Strengthen queue uniqueness to prevent duplicate company enrichment tasks.
-- 1) Extend the url partial unique index to include COMPANY items (active only).
-- 2) Add partial unique index on company_id for active COMPANY items to catch url-less tasks.

-- Drop old url index so we can recreate with the new type set
DROP INDEX IF EXISTS idx_job_queue_url;

-- Enforce url uniqueness across job, company, scrape_source, source_discovery while active
CREATE UNIQUE INDEX idx_job_queue_url ON job_queue(url)
WHERE type IN ('job', 'company', 'scrape_source', 'source_discovery')
  AND status IN ('pending', 'processing');

-- Prevent duplicate active company tasks for the same company_id (even if url differs or is null)
CREATE UNIQUE INDEX idx_job_queue_company_active ON job_queue(
    json_extract(input, '$.company_id')
)
WHERE type = 'company'
  AND json_extract(input, '$.company_id') IS NOT NULL
  AND status IN ('pending', 'processing');
