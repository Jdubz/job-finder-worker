-- Simplify content_items schema to the fields used by the current application.
-- Drops legacy columns (type, user_id, visibility, tags, ai_context, body_json).

PRAGMA foreign_keys = OFF;

-- Ensure reruns are idempotent if a previous attempt failed mid-migration
DROP TABLE IF EXISTS content_items__new;

CREATE TABLE content_items__new (
  id TEXT PRIMARY KEY,
  parent_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  role TEXT,
  location TEXT,
  website TEXT,
  start_date TEXT,
  end_date TEXT,
  description TEXT,
  skills TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

-- Preserve existing data, coalescing required fields to sensible defaults
INSERT INTO content_items__new (
  id, parent_id, order_index, title, role, location, website,
  start_date, end_date, description, skills,
  created_at, updated_at, created_by, updated_by
)
SELECT
  id,
  parent_id,
  COALESCE(order_index, 0),
  title,
  role,
  location,
  website,
  start_date,
  end_date,
  description,
  skills,
  COALESCE(created_at, datetime('now')),
  COALESCE(updated_at, datetime('now')),
  COALESCE(created_by, 'system'),
  COALESCE(updated_by, 'system')
FROM content_items;

DROP TABLE content_items;
ALTER TABLE content_items__new RENAME TO content_items;

CREATE INDEX IF NOT EXISTS idx_content_items_parent ON content_items (parent_id);

PRAGMA foreign_keys = ON;
