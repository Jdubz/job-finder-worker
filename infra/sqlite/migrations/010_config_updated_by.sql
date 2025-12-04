-- Add updated_by column to job_finder_config for auditing who changed a config entry.
ALTER TABLE job_finder_config ADD COLUMN updated_by TEXT;
