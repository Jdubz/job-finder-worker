BEGIN TRANSACTION;

-- Rebuild content_items without user_id and visibility columns
CREATE TABLE content_items_new (
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

INSERT INTO content_items_new (
  id,
  parent_id,
  order_index,
  title,
  role,
  location,
  website,
  start_date,
  end_date,
  description,
  skills,
  created_at,
  updated_at,
  created_by,
  updated_by
)
SELECT
  id,
  parent_id,
  COALESCE(order_index, 0) AS order_index,
  title,
  role,
  location,
  website,
  start_date,
  end_date,
  description,
  skills,
  COALESCE(created_at, CURRENT_TIMESTAMP) AS created_at,
  COALESCE(updated_at, CURRENT_TIMESTAMP) AS updated_at,
  COALESCE(created_by, 'admin') AS created_by,
  COALESCE(updated_by, 'admin') AS updated_by
FROM content_items;

DROP TABLE content_items;
ALTER TABLE content_items_new RENAME TO content_items;

CREATE INDEX IF NOT EXISTS idx_content_items_parent_order ON content_items(parent_id, order_index);

COMMIT;
