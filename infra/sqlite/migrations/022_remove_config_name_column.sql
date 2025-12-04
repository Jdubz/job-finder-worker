-- Remove redundant 'name' column from job_finder_config.
-- The 'id' column already serves as a human-readable identifier (e.g., 'ai-settings', 'job-filters').
-- The 'name' column was either identical to 'id' or empty, and was never used in queries or UI.

CREATE TABLE job_finder_config_new (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);

INSERT INTO job_finder_config_new (id, payload_json, updated_at, updated_by)
SELECT id, payload_json, updated_at, updated_by
FROM job_finder_config;

DROP TABLE job_finder_config;
ALTER TABLE job_finder_config_new RENAME TO job_finder_config;
