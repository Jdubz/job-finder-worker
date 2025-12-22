-- Add index on job_match_id for faster lookups
-- This improves query performance when filtering generator requests by job match

CREATE INDEX IF NOT EXISTS idx_generator_requests_job_match_id
ON generator_requests(job_match_id);
