-- Add retry tracking columns to job_queue for intelligent failure handling.
--
-- This migration adds:
--   - retry_count: Number of retry attempts made (auto-incremented on transient errors)
--   - max_retries: Maximum retries allowed before permanent failure (default 3)
--   - last_error_category: Classification of the last error (transient, permanent, resource, unknown)
--
-- These columns enable smart retry logic:
--   - Transient errors (network, rate limits): Auto-retry up to max_retries
--   - Resource errors (no agents, quota): Mark as BLOCKED for manual unblock
--   - Permanent errors (validation, auth): Immediate FAILED, no retry
--
-- Note: These columns were previously removed in migration 020 when retry logic was disabled.
-- This migration re-introduces them with the new intelligent retry system.

ALTER TABLE job_queue ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_queue ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 3;
ALTER TABLE job_queue ADD COLUMN last_error_category TEXT;

-- Index for efficiently finding items to retry or unblock
CREATE INDEX idx_job_queue_error_category ON job_queue(last_error_category)
WHERE last_error_category IS NOT NULL;
