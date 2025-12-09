-- Migration: Add archive tables for maintenance cleanup
--
-- Creates archive tables for:
-- - job_queue items older than 1 week (with terminal status)
-- - job_listings older than 2 weeks
--
-- Archive tables mirror the source schema plus archived_at timestamp.
-- This allows efficient cleanup while preserving historical data for:
-- - Debugging/auditing
-- - Preventing re-queuing of already-seen job listings

-- Archive table for job_queue items
CREATE TABLE IF NOT EXISTS job_queue_archive (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  url TEXT,
  tracking_id TEXT,
  parent_item_id TEXT,
  input TEXT,
  output TEXT,
  result_message TEXT,
  error_details TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  processed_at TEXT,
  completed_at TEXT,
  archived_at TEXT NOT NULL  -- When moved to archive
);

CREATE INDEX idx_job_queue_archive_url ON job_queue_archive(url);
CREATE INDEX idx_job_queue_archive_created ON job_queue_archive(created_at);
CREATE INDEX idx_job_queue_archive_status ON job_queue_archive(status);
CREATE INDEX idx_job_queue_archive_archived ON job_queue_archive(archived_at);

-- Archive table for job_listings
CREATE TABLE IF NOT EXISTS job_listings_archive (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  source_id TEXT,
  company_id TEXT,
  title TEXT NOT NULL,
  company_name TEXT NOT NULL,
  location TEXT,
  salary_range TEXT,
  description TEXT NOT NULL,
  posted_date TEXT,
  status TEXT NOT NULL,
  filter_result TEXT,
  match_score REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT NOT NULL  -- When moved to archive
);

CREATE INDEX idx_job_listings_archive_url ON job_listings_archive(url);
CREATE INDEX idx_job_listings_archive_created ON job_listings_archive(created_at);
CREATE INDEX idx_job_listings_archive_archived ON job_listings_archive(archived_at);
