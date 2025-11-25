-- Restore ai_context column for content items to help the document generator
-- categorize content (experience, education, project, skill, overview, etc.)

ALTER TABLE content_items ADD COLUMN ai_context TEXT;

-- Backfill ai_context based on existing ID patterns
UPDATE content_items SET ai_context = 'education' WHERE id LIKE 'education-%';
UPDATE content_items SET ai_context = 'project' WHERE id LIKE 'project-%';
UPDATE content_items SET ai_context = 'overview' WHERE id IN ('overview', 'biography', 'closing-notes');
UPDATE content_items SET ai_context = 'skill' WHERE id IN ('skills-technologies');
UPDATE content_items SET ai_context = 'experience' WHERE ai_context IS NULL AND role IS NOT NULL AND title IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_content_items_ai_context ON content_items (ai_context);
