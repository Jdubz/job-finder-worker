-- Add intermediate_results_json column to generator_requests table
-- This stores draft resume/cover letter content during the review step
ALTER TABLE generator_requests ADD COLUMN intermediate_results_json TEXT;
