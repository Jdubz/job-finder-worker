-- Add company match-related attributes and drop legacy company-scoring config

ALTER TABLE companies ADD COLUMN is_remote_first INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN ai_ml_focus INTEGER DEFAULT 0;
ALTER TABLE companies ADD COLUMN employee_count INTEGER;
ALTER TABLE companies ADD COLUMN timezone_offset REAL;
