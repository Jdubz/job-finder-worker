-- Add indexes to optimize maintenance queries
-- These composite indexes improve performance for archiving and cleanup operations

-- Index for archiving old queue items (filters on status + completed_at)
CREATE INDEX IF NOT EXISTS idx_job_queue_status_completed
ON job_queue(status, completed_at);

-- Index for archiving old listings (filters on created_at)
CREATE INDEX IF NOT EXISTS idx_job_listings_created_at
ON job_listings(created_at);
