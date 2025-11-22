-- Use ALTER TABLE DROP COLUMN (SQLite >=3.35 via better-sqlite3 upgrade)
DROP INDEX IF EXISTS idx_content_items_visibility;
DROP INDEX IF EXISTS idx_content_items_visible;

-- user_id was already removed in prior cleanup; drop only visibility if present
ALTER TABLE content_items DROP COLUMN visibility;
