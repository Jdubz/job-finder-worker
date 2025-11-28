-- Migration: Add analysis_result column to job_listings for storing scoring breakdown

ALTER TABLE job_listings
ADD COLUMN analysis_result TEXT; -- JSON blob with AI scoring / rationale

