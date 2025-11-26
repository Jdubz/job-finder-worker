-- Persist generator workflow step state with each request
ALTER TABLE generator_requests ADD COLUMN steps_json TEXT;
