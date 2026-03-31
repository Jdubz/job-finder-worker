-- Extend job_matches for application lifecycle tracking
ALTER TABLE job_matches ADD COLUMN applied_at TEXT;
ALTER TABLE job_matches ADD COLUMN status_updated_by TEXT;
ALTER TABLE job_matches ADD COLUMN status_note TEXT;

-- Backfill: set applied_at for existing 'applied' matches
UPDATE job_matches SET applied_at = updated_at WHERE status = 'applied';
