-- Add ai_context column for content items to help the document generator
-- categorize content. See migration 013 for taxonomy classification.

ALTER TABLE content_items ADD COLUMN ai_context TEXT;

CREATE INDEX IF NOT EXISTS idx_content_items_ai_context ON content_items (ai_context);
