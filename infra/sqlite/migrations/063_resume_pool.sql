-- Resume Pool: merge 5 curated versions into a single pool for AI-driven selection.
-- The pool intentionally contains MORE content than fits on 1 page.
-- AI selects the best subset per job application.

-- Defer foreign key checks until COMMIT so that step 3 can insert child items
-- whose parents were deduped, and step 4 can fix them before validation runs.
PRAGMA defer_foreign_keys = ON;

BEGIN;

-- 1. Create the pool version
INSERT INTO resume_versions (id, slug, name, description, created_at, updated_at)
VALUES (
  'rv-pool',
  'pool',
  'Resume Pool',
  'Master pool of curated resume content. AI selects the best subset per job application.',
  datetime('now'),
  datetime('now')
);

-- 2. Copy all items from fullstack version into pool, remapping IDs and parent_ids.
--    Uses 'pool-' prefix + original ID to create deterministic new IDs.
--    Root items (parent_id IS NULL) get parent_id = NULL in pool.
--    Child items get parent_id remapped to the pool copy of their parent.
INSERT INTO resume_items (
  id, resume_version_id, parent_id, order_index, ai_context,
  title, role, location, website, start_date, end_date,
  description, skills, created_at, updated_at, created_by, updated_by
)
SELECT
  'pool-' || id,
  'rv-pool',
  CASE WHEN parent_id IS NULL THEN NULL ELSE 'pool-' || parent_id END,
  order_index,
  ai_context,
  title, role, location, website, start_date, end_date,
  description, skills, datetime('now'), datetime('now'), created_by, updated_by
FROM resume_items
WHERE resume_version_id = 'rv-fullstack';

-- 3. Merge unique items from the other 4 versions (frontend, backend, ai, solution-engineer).
--    Dedup: skip items where (ai_context, title, role, description) already exists in pool.
--    Only copies items that are NOT already represented.
--    Uses 'pool-' || id for deterministic remapping.
--    NOTE: Some child items may temporarily have invalid parent_ids (pointing to deduped parents).
--    Step 4 fixes these before COMMIT triggers FK validation (defer_foreign_keys = ON).
INSERT OR IGNORE INTO resume_items (
  id, resume_version_id, parent_id, order_index, ai_context,
  title, role, location, website, start_date, end_date,
  description, skills, created_at, updated_at, created_by, updated_by
)
SELECT
  'pool-' || src.id,
  'rv-pool',
  CASE WHEN src.parent_id IS NULL THEN NULL ELSE 'pool-' || src.parent_id END,
  src.order_index,
  src.ai_context,
  src.title, src.role, src.location, src.website, src.start_date, src.end_date,
  src.description, src.skills, datetime('now'), datetime('now'), src.created_by, src.updated_by
FROM resume_items src
WHERE src.resume_version_id IN ('rv-frontend', 'rv-backend', 'rv-ai', 'rv-solution-engineer')
  AND NOT EXISTS (
    SELECT 1 FROM resume_items pool
    WHERE pool.resume_version_id = 'rv-pool'
      AND COALESCE(pool.ai_context, '') = COALESCE(src.ai_context, '')
      AND COALESCE(pool.title, '') = COALESCE(src.title, '')
      AND COALESCE(pool.role, '') = COALESCE(src.role, '')
      AND COALESCE(pool.description, '') = COALESCE(src.description, '')
  );

-- 4. Fix orphaned parent_ids from the merge.
--    When a child item was unique (inserted), but its parent was deduped (skipped),
--    the child's parent_id points to a non-existent pool item (pool-<other_version_parent_id>).
--    Resolve by finding the content-matching pool item using the original (pre-deletion) data.
UPDATE resume_items
SET parent_id = (
  SELECT pool_parent.id
  FROM resume_items original_parent
  JOIN resume_items pool_parent
    ON pool_parent.resume_version_id = 'rv-pool'
    AND COALESCE(pool_parent.ai_context, '') = COALESCE(original_parent.ai_context, '')
    AND COALESCE(pool_parent.title, '') = COALESCE(original_parent.title, '')
    AND COALESCE(pool_parent.role, '') = COALESCE(original_parent.role, '')
    AND COALESCE(pool_parent.description, '') = COALESCE(original_parent.description, '')
  WHERE 'pool-' || original_parent.id = resume_items.parent_id
    AND original_parent.resume_version_id IN (
      SELECT id FROM resume_versions
      WHERE slug IN ('frontend', 'fullstack', 'backend', 'ai', 'solution-engineer')
    )
  LIMIT 1
)
WHERE resume_version_id = 'rv-pool'
  AND parent_id IS NOT NULL
  AND parent_id NOT IN (SELECT id FROM resume_items WHERE resume_version_id = 'rv-pool');

-- 5. Delete old 5 versions (CASCADE removes their items)
DELETE FROM resume_versions WHERE slug IN ('frontend', 'fullstack', 'backend', 'ai', 'solution-engineer');

-- 6. Create tailored_resumes table for caching AI-generated selections
CREATE TABLE tailored_resumes (
  id              TEXT PRIMARY KEY,
  job_match_id    TEXT NOT NULL,
  resume_content  TEXT NOT NULL,       -- JSON: full ResumeContent after selection
  selected_items  TEXT NOT NULL,       -- JSON: array of pool item IDs selected
  pdf_path        TEXT,
  pdf_size_bytes  INTEGER,
  content_fit     TEXT,                -- JSON: ContentFitEstimate
  reasoning       TEXT,                -- AI's reasoning for selections
  created_at      TEXT NOT NULL,
  expires_at      TEXT NOT NULL,

  FOREIGN KEY (job_match_id) REFERENCES job_matches(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_tailored_resumes_job_match ON tailored_resumes(job_match_id);
CREATE INDEX idx_tailored_resumes_expires ON tailored_resumes(expires_at);

COMMIT;
