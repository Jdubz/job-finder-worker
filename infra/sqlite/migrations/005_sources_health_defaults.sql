-- Ensure existing sources have tier/default health JSON so rotation/health logic works.

UPDATE job_sources
SET tier = 'D'
WHERE tier IS NULL;

UPDATE job_sources
SET health_json = '{}'
WHERE health_json IS NULL;

