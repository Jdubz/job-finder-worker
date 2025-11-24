-- Extend job_sources with discovery metadata and validation flags
-- so source discovery can persist what it produces.

ALTER TABLE job_sources ADD COLUMN discovery_confidence TEXT;
ALTER TABLE job_sources ADD COLUMN discovered_via TEXT;
ALTER TABLE job_sources ADD COLUMN discovered_by TEXT;
ALTER TABLE job_sources ADD COLUMN discovery_queue_item_id TEXT;
ALTER TABLE job_sources ADD COLUMN validation_required INTEGER NOT NULL DEFAULT 0;
ALTER TABLE job_sources ADD COLUMN tier TEXT NOT NULL DEFAULT 'D';
ALTER TABLE job_sources ADD COLUMN health_json TEXT DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_job_sources_discovery_queue
  ON job_sources (discovery_queue_item_id);
