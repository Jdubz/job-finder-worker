-- Add last_error column to job_sources table.
-- Records the error message from the last scrape attempt (NULL on success).
-- Required by update_scrape_status() in job_sources_manager.py.

ALTER TABLE job_sources ADD COLUMN last_error TEXT;
