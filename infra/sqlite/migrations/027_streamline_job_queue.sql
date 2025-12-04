-- Migration: streamline job_queue schema for lean scheduling ledger
-- Hard cut: move per-task inputs/outputs into JSON blobs, drop unused columns

DROP VIEW IF EXISTS view_queue_ready;

CREATE TABLE job_queue_new (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
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
    completed_at TEXT
);

-- Copy and reshape existing data into input/output JSON blobs
INSERT INTO job_queue_new (
    id, type, status, url, tracking_id, parent_item_id, input, output,
    result_message, error_details, created_at, updated_at, processed_at, completed_at
)
SELECT
    id,
    type,
    status,
    url,
    tracking_id,
    parent_item_id,
    json_object(
        'company_name', company_name,
        'company_id', company_id,
        'source', source,
        'submitted_by', submitted_by,
        'scrape_config', scrape_config,
        'source_discovery_config', source_discovery_config,
        'source_id', source_id,
        'source_type', source_type,
        'source_config', source_config,
        'source_tier', source_tier,
        'metadata', metadata
    ) AS input,
    json_object(
        'scraped_data', scraped_data,
        'pipeline_state', pipeline_state,
        'review_notes', review_notes
    ) AS output,
    result_message,
    error_details,
    created_at,
    updated_at,
    processed_at,
    completed_at
FROM job_queue;

DROP TABLE job_queue;
ALTER TABLE job_queue_new RENAME TO job_queue;

-- Indexes
CREATE INDEX idx_job_queue_status ON job_queue(status);
CREATE INDEX idx_job_queue_type ON job_queue(type);
CREATE INDEX idx_job_queue_created_at ON job_queue(created_at);
CREATE INDEX idx_job_queue_tracking_id ON job_queue(tracking_id);
CREATE UNIQUE INDEX idx_job_queue_url ON job_queue(url)
WHERE type IN ('job', 'scrape_source', 'source_discovery')
  AND status IN ('pending', 'processing');

-- Optional lightweight ready view
CREATE VIEW IF NOT EXISTS view_queue_ready AS
SELECT id, url, status
FROM job_queue
WHERE status = 'pending'
ORDER BY created_at ASC;
