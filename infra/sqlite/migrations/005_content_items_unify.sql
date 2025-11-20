-- Unify content_items schema around the new nested resume model

PRAGMA foreign_keys=OFF;

CREATE TABLE content_items_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
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

WITH legacy AS (
  SELECT
    id,
    user_id,
    parent_id,
    order_index,
    visibility,
    created_at,
    updated_at,
    created_by,
    updated_by,
    body_json,
    COALESCE(json_extract(body_json, '$.startDate'), json_extract(body_json, '$.start_date')) AS raw_start,
    COALESCE(json_extract(body_json, '$.endDate'), json_extract(body_json, '$.end_date')) AS raw_end,
    COALESCE(json_extract(body_json, '$.skills'), json_extract(body_json, '$.technologies')) AS raw_skills
  FROM content_items
)
INSERT INTO content_items_new (
  id,
  user_id,
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
  user_id,
  CASE
    WHEN parent_id IS NULL OR trim(parent_id) = '' THEN NULL
    WHEN json_valid(parent_id) AND json_type(parent_id, '$.nullValue') = 'null' THEN NULL
    WHEN json_valid(parent_id) AND json_type(parent_id, '$.stringValue') IS NOT NULL THEN json_extract(parent_id, '$.stringValue')
    ELSE parent_id
  END AS parent_id,
  COALESCE(CAST(json_extract(body_json, '$.order') AS INTEGER), order_index, 0) AS order_index,
  COALESCE(
    json_extract(body_json, '$.title'),
    json_extract(body_json, '$.name'),
    json_extract(body_json, '$.heading')
  ) AS title,
  COALESCE(
    json_extract(body_json, '$.role'),
    json_extract(body_json, '$.company')
  ) AS role,
  json_extract(body_json, '$.location') AS location,
  COALESCE(
    json_extract(body_json, '$.website'),
    json_extract(body_json, '$.url'),
    json_extract(body_json, '$.links[0].url')
  ) AS website,
  CASE
    WHEN raw_start IS NULL OR trim(raw_start) = '' THEN NULL
    WHEN raw_start GLOB '____-__*' THEN substr(raw_start, 1, 7)
    WHEN raw_start GLOB '____' THEN substr(raw_start, 1, 4) || '-01'
    WHEN instr(raw_start, ' ') > 0 THEN
      printf(
        '%s-%s',
        substr(raw_start, length(raw_start) - 3, 4),
        CASE lower(substr(raw_start, 1, instr(raw_start, ' ') - 1))
          WHEN 'january' THEN '01'
          WHEN 'february' THEN '02'
          WHEN 'march' THEN '03'
          WHEN 'april' THEN '04'
          WHEN 'may' THEN '05'
          WHEN 'june' THEN '06'
          WHEN 'july' THEN '07'
          WHEN 'august' THEN '08'
          WHEN 'september' THEN '09'
          WHEN 'october' THEN '10'
          WHEN 'november' THEN '11'
          WHEN 'december' THEN '12'
          ELSE NULL
        END
      )
    ELSE NULL
  END AS start_date,
  CASE
    WHEN raw_end IS NULL OR trim(raw_end) = '' THEN NULL
    WHEN raw_end GLOB '____-__*' THEN substr(raw_end, 1, 7)
    WHEN raw_end GLOB '____' THEN substr(raw_end, 1, 4) || '-01'
    WHEN instr(raw_end, ' ') > 0 THEN
      printf(
        '%s-%s',
        substr(raw_end, length(raw_end) - 3, 4),
        CASE lower(substr(raw_end, 1, instr(raw_end, ' ') - 1))
          WHEN 'january' THEN '01'
          WHEN 'february' THEN '02'
          WHEN 'march' THEN '03'
          WHEN 'april' THEN '04'
          WHEN 'may' THEN '05'
          WHEN 'june' THEN '06'
          WHEN 'july' THEN '07'
          WHEN 'august' THEN '08'
          WHEN 'september' THEN '09'
          WHEN 'october' THEN '10'
          WHEN 'november' THEN '11'
          WHEN 'december' THEN '12'
          ELSE NULL
        END
      )
    ELSE NULL
  END AS end_date,
  COALESCE(
    json_extract(body_json, '$.description'),
    json_extract(body_json, '$.summary'),
    json_extract(body_json, '$.content')
  ) AS description,
  CASE
    WHEN raw_skills IS NULL OR trim(raw_skills) = '' THEN NULL
    ELSE json(raw_skills)
  END AS skills,
  visibility,
  created_at,
  updated_at,
  created_by,
  updated_by
FROM legacy;

DROP TABLE content_items;

ALTER TABLE content_items_new RENAME TO content_items;

CREATE INDEX idx_content_items_parent_order ON content_items(parent_id, order_index);
CREATE INDEX idx_content_items_visibility ON content_items(visibility);

PRAGMA foreign_keys=ON;

