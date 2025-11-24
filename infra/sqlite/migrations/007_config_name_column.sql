-- Add name column to job_finder_config for human-readable config identification.
-- Using IF NOT EXISTS to make this migration idempotent

ALTER TABLE job_finder_config ADD COLUMN IF NOT EXISTS name TEXT;
