-- Add analysis_progress column for tracking pipeline stage completion
-- Older SQLite builds may not support IF NOT EXISTS on ADD COLUMN; this migration
-- is applied once in sequence, so a simple ADD COLUMN is sufficient.
ALTER TABLE companies ADD COLUMN analysis_progress TEXT DEFAULT '{}';

-- Normalize existing analysis_status values to the enum set
UPDATE companies SET analysis_status = 'active' WHERE analysis_status = 'complete';
UPDATE companies SET analysis_status = 'pending' WHERE analysis_status IS NULL OR analysis_status = '';

-- Backfill progress for rows that already completed the pipeline
UPDATE companies
SET analysis_progress = '{"fetch":true,"extract":true,"analyze":true,"save":true}'
WHERE analysis_status = 'active' AND (analysis_progress IS NULL OR analysis_progress = '{}');
