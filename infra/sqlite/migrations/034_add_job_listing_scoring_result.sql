-- Migration: Add scoring_result column to job_listings
-- Stores the deterministic scoring breakdown (baseScore, finalScore, adjustments).
-- This is separate from AI analysis which lives in job_matches.

ALTER TABLE job_listings ADD COLUMN scoring_result TEXT;
