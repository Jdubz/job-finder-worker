-- Refreshes the job_queue table so new queue item types and lineage columns
-- can pass CHECK constraints. Extends the `type` enum to include scrape, source
-- discovery tasks, and scrape_source while preserving existing data.

DROP VIEW IF EXISTS view_queue_ready;

CREATE TABLE job_queue__new (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('job','company','scrape','source_discovery','scrape_source')),
  status TEXT NOT NULL CHECK (status IN ('pending','processing','success','failed','skipped','filtered')),
  url TEXT NOT NULL,
  company_name TEXT,
  source TEXT NOT NULL DEFAULT 'manual_submission',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  submitted_by TEXT,
  company_id TEXT,
  metadata TEXT,
  scrape_config TEXT,
  scraped_data TEXT,
  source_discovery_config TEXT,
  sub_task TEXT,
  pipeline_state TEXT,
  pipeline_stage TEXT,
  parent_item_id TEXT,
  company_sub_task TEXT,
  source_id TEXT,
  source_type TEXT,
  source_config TEXT,
  source_tier TEXT,
  tracking_id TEXT NOT NULL DEFAULT '',
  ancestry_chain TEXT,
  spawn_depth INTEGER NOT NULL DEFAULT 0,
  max_spawn_depth INTEGER NOT NULL DEFAULT 10,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  processed_at TEXT,
  completed_at TEXT,
  result_message TEXT,
  error_details TEXT
);

INSERT INTO job_queue__new (
  id, type, status, url, company_name, source, retry_count, max_retries,
  submitted_by, company_id, metadata, scrape_config, scraped_data,
  source_discovery_config, sub_task, pipeline_state, pipeline_stage, parent_item_id,
  company_sub_task, source_id, source_type, source_config, source_tier,
  tracking_id, ancestry_chain, spawn_depth, max_spawn_depth,
  created_at, updated_at, processed_at, completed_at,
  result_message, error_details
)
SELECT
  id, type, status, url, company_name, source, retry_count, max_retries,
  submitted_by, company_id, metadata, scrape_config, scraped_data,
  source_discovery_config, sub_task, pipeline_state, pipeline_stage, parent_item_id,
  company_sub_task, source_id, source_type, source_config, source_tier,
  tracking_id, ancestry_chain, spawn_depth, max_spawn_depth,
  created_at, updated_at, processed_at, completed_at,
  result_message, error_details
FROM job_queue;

DROP TABLE job_queue;
ALTER TABLE job_queue__new RENAME TO job_queue;

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_queue_url ON job_queue (url);
CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue (status);
CREATE INDEX IF NOT EXISTS idx_job_queue_source ON job_queue (source);

CREATE VIEW IF NOT EXISTS view_queue_ready AS
SELECT id, url, company_name, status
FROM job_queue
WHERE status = 'pending'
ORDER BY created_at ASC;
