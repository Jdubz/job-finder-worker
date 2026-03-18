-- Multi-user isolation: add user_id ownership to per-user tables,
-- create user_config for per-user settings, migrate roles.

-- ── 1. Add user_id to per-user tables ────────────────────────────────────────

-- content_items: user_id was dropped in migration 005. Re-add it.
ALTER TABLE content_items ADD COLUMN user_id TEXT REFERENCES users(id);

-- resume_versions
ALTER TABLE resume_versions ADD COLUMN user_id TEXT REFERENCES users(id);

-- resume_items
ALTER TABLE resume_items ADD COLUMN user_id TEXT REFERENCES users(id);

-- job_matches
ALTER TABLE job_matches ADD COLUMN user_id TEXT REFERENCES users(id);

-- generator_requests
ALTER TABLE generator_requests ADD COLUMN user_id TEXT REFERENCES users(id);

-- generator_artifacts
ALTER TABLE generator_artifacts ADD COLUMN user_id TEXT REFERENCES users(id);

-- tailored_resumes
ALTER TABLE tailored_resumes ADD COLUMN user_id TEXT REFERENCES users(id);

-- document_cache
ALTER TABLE document_cache ADD COLUMN user_id TEXT REFERENCES users(id);

-- selection_cache
ALTER TABLE selection_cache ADD COLUMN user_id TEXT REFERENCES users(id);

-- job_queue: nullable (system tasks have no user)
ALTER TABLE job_queue ADD COLUMN user_id TEXT REFERENCES users(id);

-- job_queue_archive: nullable
ALTER TABLE job_queue_archive ADD COLUMN user_id TEXT;

-- ── 2. Backfill per-user tables to admin ─────────────────────────────────────
-- Admin is the first user (single-user system). Use a subquery to find them.
-- ORDER BY created_at to deterministically pick the earliest admin.

UPDATE content_items SET user_id = (SELECT id FROM users WHERE roles LIKE '%admin%' ORDER BY created_at ASC LIMIT 1)
  WHERE user_id IS NULL;

UPDATE resume_versions SET user_id = (SELECT id FROM users WHERE roles LIKE '%admin%' ORDER BY created_at ASC LIMIT 1)
  WHERE user_id IS NULL;

UPDATE resume_items SET user_id = (SELECT id FROM users WHERE roles LIKE '%admin%' ORDER BY created_at ASC LIMIT 1)
  WHERE user_id IS NULL;

UPDATE job_matches SET user_id = (SELECT id FROM users WHERE roles LIKE '%admin%' ORDER BY created_at ASC LIMIT 1)
  WHERE user_id IS NULL;

-- generator_requests: backfill from created_by if set, else admin
UPDATE generator_requests SET user_id = COALESCE(
  created_by,
  (SELECT id FROM users WHERE roles LIKE '%admin%' ORDER BY created_at ASC LIMIT 1)
) WHERE user_id IS NULL;

-- generator_artifacts: backfill from parent generator_requests.user_id, fallback to admin
UPDATE generator_artifacts SET user_id = COALESCE(
  (SELECT gr.user_id FROM generator_requests gr WHERE gr.id = generator_artifacts.request_id),
  (SELECT id FROM users WHERE roles LIKE '%admin%' ORDER BY created_at ASC LIMIT 1)
) WHERE user_id IS NULL;

-- tailored_resumes: backfill from parent job_matches.user_id
UPDATE tailored_resumes SET user_id = (
  SELECT jm.user_id FROM job_matches jm WHERE jm.id = tailored_resumes.job_match_id
) WHERE user_id IS NULL;

UPDATE document_cache SET user_id = (SELECT id FROM users WHERE roles LIKE '%admin%' ORDER BY created_at ASC LIMIT 1)
  WHERE user_id IS NULL;

UPDATE selection_cache SET user_id = (SELECT id FROM users WHERE roles LIKE '%admin%' ORDER BY created_at ASC LIMIT 1)
  WHERE user_id IS NULL;

-- ── 3. Create user_config table ──────────────────────────────────────────────

CREATE TABLE user_config (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  payload_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT,
  PRIMARY KEY (id, user_id)
);

-- Backfill per-user configs from job_finder_config for admin user
INSERT OR IGNORE INTO user_config (id, user_id, payload_json, updated_at, updated_by)
SELECT
  jfc.id,
  (SELECT id FROM users WHERE roles LIKE '%admin%' ORDER BY created_at ASC LIMIT 1),
  jfc.payload_json,
  jfc.updated_at,
  jfc.updated_by
FROM job_finder_config jfc
WHERE jfc.id IN ('match-policy', 'prefilter-policy', 'personal-info');

-- ── 4. Migrate roles ─────────────────────────────────────────────────────────

-- Migrate old roles to new ones, then deduplicate (e.g. 'admin,editor,viewer' -> 'admin,user')
UPDATE users SET roles = REPLACE(REPLACE(roles, 'editor', 'user'), 'viewer', 'user');
-- Deduplicate: remove repeated 'user' entries (e.g. 'admin,user,user' -> 'admin,user')
UPDATE users SET roles = REPLACE(roles, 'user,user', 'user') WHERE roles LIKE '%user,user%';

-- ── 5. Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX idx_content_items_user ON content_items(user_id);
CREATE INDEX idx_resume_versions_user ON resume_versions(user_id);
CREATE INDEX idx_resume_items_user ON resume_items(user_id);
CREATE INDEX idx_job_matches_user ON job_matches(user_id);
CREATE INDEX idx_job_matches_user_status ON job_matches(user_id, status);
CREATE INDEX idx_generator_requests_user ON generator_requests(user_id);
CREATE INDEX idx_generator_artifacts_user ON generator_artifacts(user_id);
CREATE INDEX idx_tailored_resumes_user ON tailored_resumes(user_id);
CREATE INDEX idx_document_cache_user ON document_cache(user_id);
CREATE INDEX idx_selection_cache_user ON selection_cache(user_id);
CREATE INDEX idx_job_queue_user ON job_queue(user_id);
CREATE INDEX idx_job_queue_archive_user ON job_queue_archive(user_id);
CREATE INDEX idx_user_config_user ON user_config(user_id);
