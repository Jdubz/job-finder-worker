-- Enforce tracking_id and other required fields on job_queue
-- Steps:
-- 1) Backfill missing tracking_id/input/output
-- 2) Recreate job_queue with NOT NULL + CHECK constraints

PRAGMA foreign_keys=off;
BEGIN TRANSACTION;

-- Drop dependent view to avoid breakage while we recreate job_queue
DROP VIEW IF EXISTS view_queue_ready;

-- Backfill existing rows (single pass for efficiency)
UPDATE job_queue
SET tracking_id = COALESCE(tracking_id, id),
    input = COALESCE(input, '{}'),
    output = COALESCE(output, '{}')
WHERE tracking_id IS NULL OR input IS NULL OR output IS NULL;

-- Create new table with constraints
CREATE TABLE job_queue_new (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    url TEXT,
    tracking_id TEXT NOT NULL CHECK (length(tracking_id) > 0),
    parent_item_id TEXT,
    input TEXT NOT NULL DEFAULT '{}',
    output TEXT NOT NULL DEFAULT '{}',
    result_message TEXT,
    error_details TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    processed_at TEXT,
    completed_at TEXT,
    dedupe_key TEXT
);

-- Copy data
INSERT INTO job_queue_new (
    id, type, status, url, tracking_id, parent_item_id, input, output,
    result_message, error_details, created_at, updated_at, processed_at, completed_at, dedupe_key
)
SELECT id,
       type,
       status,
       url,
       tracking_id,
       parent_item_id,
       input,
       output,
       result_message,
       error_details,
       created_at,
       updated_at,
       processed_at,
       completed_at,
       NULL AS dedupe_key
FROM job_queue;

-- Swap tables
DROP TABLE job_queue;
ALTER TABLE job_queue_new RENAME TO job_queue;

-- Recreate indexes
CREATE INDEX idx_job_queue_status ON job_queue(status);
CREATE INDEX idx_job_queue_type ON job_queue(type);
CREATE INDEX idx_job_queue_created_at ON job_queue(created_at);
CREATE INDEX idx_job_queue_tracking_id ON job_queue(tracking_id);
CREATE UNIQUE INDEX idx_job_queue_url ON job_queue(url)
WHERE type IN ('job', 'company', 'scrape_source', 'source_discovery')
  AND status IN ('pending', 'processing');
CREATE UNIQUE INDEX idx_job_queue_company_active ON job_queue(
    json_extract(input, '$.company_id')
)
WHERE type = 'company'
  AND json_extract(input, '$.company_id') IS NOT NULL
  AND status IN ('pending', 'processing');
CREATE INDEX idx_job_queue_status_completed
ON job_queue(status, completed_at);
CREATE UNIQUE INDEX idx_job_queue_dedupe_active
                ON job_queue(dedupe_key)
                WHERE dedupe_key IS NOT NULL AND status IN ('pending','processing');

-- Recreate lightweight ready view (kept for compatibility with dev tooling)
CREATE VIEW IF NOT EXISTS view_queue_ready AS
SELECT id, url, status
FROM job_queue
WHERE status = 'pending'
ORDER BY created_at ASC;

COMMIT;
PRAGMA foreign_keys=on;
