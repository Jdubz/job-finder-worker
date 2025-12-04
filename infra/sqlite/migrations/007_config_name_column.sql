-- Add name column to job_finder_config for human-readable config identification.

ALTER TABLE job_finder_config ADD COLUMN name TEXT;
