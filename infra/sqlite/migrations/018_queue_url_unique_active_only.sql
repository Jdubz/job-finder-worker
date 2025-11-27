-- Update URL uniqueness to only apply to active (pending/processing) items.
-- Failed/success/skipped/filtered items should not block new work for the same URL.
-- This allows company discovery to be retried after failures.

DROP INDEX IF EXISTS idx_job_queue_url;

-- Partial unique index: only enforce uniqueness for active items
CREATE UNIQUE INDEX idx_job_queue_url ON job_queue (url)
WHERE type IN ('job', 'company', 'source_discovery')
  AND status IN ('pending', 'processing');
