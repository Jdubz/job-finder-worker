-- Adds additional metadata needed by the Python worker after the SQLite migration.

ALTER TABLE job_queue ADD COLUMN pipeline_stage TEXT;
ALTER TABLE job_queue ADD COLUMN source_id TEXT;
ALTER TABLE job_queue ADD COLUMN source_type TEXT;
ALTER TABLE job_queue ADD COLUMN source_config TEXT;
ALTER TABLE job_queue ADD COLUMN source_tier TEXT;
ALTER TABLE job_queue ADD COLUMN tracking_id TEXT DEFAULT '';
ALTER TABLE job_queue ADD COLUMN ancestry_chain TEXT;
ALTER TABLE job_queue ADD COLUMN spawn_depth INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_queue ADD COLUMN max_spawn_depth INTEGER NOT NULL DEFAULT 10;

ALTER TABLE companies ADD COLUMN analysis_status TEXT;
