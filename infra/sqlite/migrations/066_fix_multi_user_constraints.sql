-- Fix UNIQUE constraints that block multi-user support.
--
-- resume_versions.slug was UNIQUE globally (migration 062), but in multi-user
-- mode each user should be able to have their own "pool" version. Change to
-- UNIQUE(slug, user_id).
--
-- SQLite cannot ALTER constraints, so we must recreate the table.

PRAGMA foreign_keys=off;

BEGIN;

-- ── 1. Recreate resume_versions with composite UNIQUE(slug, user_id) ────────

CREATE TABLE resume_versions_new (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL,
  name            TEXT NOT NULL,
  description     TEXT,
  pdf_path        TEXT,
  pdf_size_bytes  INTEGER,
  published_at    TEXT,
  published_by    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  user_id         TEXT REFERENCES users(id),
  UNIQUE(slug, user_id)
);

INSERT INTO resume_versions_new (
  id, slug, name, description, pdf_path, pdf_size_bytes,
  published_at, published_by, created_at, updated_at, user_id
)
SELECT
  id, slug, name, description, pdf_path, pdf_size_bytes,
  published_at, published_by, created_at, updated_at, user_id
FROM resume_versions;

DROP TABLE resume_versions;
ALTER TABLE resume_versions_new RENAME TO resume_versions;

-- Recreate indexes
CREATE INDEX idx_resume_versions_user ON resume_versions(user_id);

COMMIT;

PRAGMA foreign_keys=on;
