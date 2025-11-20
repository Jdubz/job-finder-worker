-- Unify content_items schema around the new nested resume model

PRAGMA foreign_keys=OFF;

ALTER TABLE content_items RENAME TO content_items_legacy;

CREATE TABLE content_items (
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
  visibility TEXT NOT NULL DEFAULT 'draft' CHECK (visibility IN ('published','draft','archived')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

INSERT INTO content_items (
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
  visibility,
  created_at,
  updated_at,
  created_by,
  updated_by
)
SELECT
  id,
  parent_id,
  order_index,
  COALESCE(
    json_extract(body_json, '$.title'),
    json_extract(body_json, '$.name'),
    json_extract(body_json, '$.heading')
  ) AS title,
  COALESCE(
    json_extract(body_json, '$.role'),
    json_extract(body_json, '$.company'),
    json_extract(body_json, '$.category')
  ) AS role,
  json_extract(body_json, '$.location') AS location,
  COALESCE(
    json_extract(body_json, '$.website'),
    json_extract(body_json, '$.url'),
    json_extract(body_json, '$.links[0].url')
  ) AS website,
  COALESCE(
    json_extract(body_json, '$.startDate'),
    json_extract(body_json, '$.start_date')
  ) AS start_date,
  COALESCE(
    json_extract(body_json, '$.endDate'),
    json_extract(body_json, '$.end_date')
  ) AS end_date,
  COALESCE(
    json_extract(body_json, '$.description'),
    json_extract(body_json, '$.summary'),
    json_extract(body_json, '$.content')
  ) AS description,
  COALESCE(
    json_extract(body_json, '$.skills'),
    json_extract(body_json, '$.technologies')
  ) AS skills,
  visibility,
  created_at,
  updated_at,
  created_by,
  updated_by
FROM content_items_legacy;

DROP TABLE content_items_legacy;

CREATE INDEX idx_content_items_parent_order ON content_items(parent_id, order_index);
CREATE INDEX idx_content_items_visibility ON content_items(visibility);

PRAGMA foreign_keys=ON;
