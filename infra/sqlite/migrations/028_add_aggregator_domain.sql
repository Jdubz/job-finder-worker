-- Add aggregator_domain to job_sources for dynamic job board detection
-- When set, this source is an aggregator platform (hosts jobs for multiple companies)
-- The domain value is used to:
--   1. Reject it as a valid company.website
--   2. Force company extraction from individual job listings

ALTER TABLE job_sources ADD COLUMN aggregator_domain TEXT;

-- Index for efficient lookup of all aggregator domains
CREATE INDEX IF NOT EXISTS idx_job_sources_aggregator_domain
  ON job_sources (aggregator_domain) WHERE aggregator_domain IS NOT NULL;
