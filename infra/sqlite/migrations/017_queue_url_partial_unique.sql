-- Make URL uniqueness conditional on queue item type.
-- Scrape and scrape_source items don't have meaningful URLs and shouldn't
-- be subject to deduplication. Only job, company, and source_discovery
-- items need URL uniqueness.

DROP INDEX IF EXISTS idx_job_queue_url;

-- Clean up any existing duplicates before creating unique index.
-- Keep the most recent item (by created_at) for each duplicate URL,
-- preferring completed/failed items over pending ones.
DELETE FROM job_queue
WHERE id IN (
  SELECT id FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY url, type
        ORDER BY
          CASE status
            WHEN 'complete' THEN 1
            WHEN 'failed' THEN 2
            WHEN 'in_progress' THEN 3
            ELSE 4
          END,
          created_at DESC
      ) AS rn
    FROM job_queue
    WHERE type IN ('job', 'company', 'source_discovery')
      AND url IS NOT NULL
  )
  WHERE rn > 1
);

-- Partial unique index: only enforce uniqueness for types with real URLs
CREATE UNIQUE INDEX idx_job_queue_url ON job_queue (url)
WHERE type IN ('job', 'company', 'source_discovery');
