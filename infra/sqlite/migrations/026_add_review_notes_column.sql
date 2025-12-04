-- Migration: Add review_notes column to job_queue for agent review analysis
--
-- The review_notes column stores the agent reviewer's analysis of failed tasks:
-- - Root cause analysis
-- - Why the task failed
-- - Recommended fixes
-- - Recovery attempt results

ALTER TABLE job_queue ADD COLUMN review_notes TEXT;
