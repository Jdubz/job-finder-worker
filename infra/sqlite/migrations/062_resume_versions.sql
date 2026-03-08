-- Resume Versions: static, role-targeted resume management
-- Replaces per-application AI resume generation with curated versions.

CREATE TABLE resume_versions (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  pdf_path        TEXT,
  pdf_size_bytes  INTEGER,
  published_at    TEXT,
  published_by    TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE resume_items (
  id                  TEXT PRIMARY KEY,
  resume_version_id   TEXT NOT NULL REFERENCES resume_versions(id) ON DELETE CASCADE,
  parent_id           TEXT REFERENCES resume_items(id) ON DELETE SET NULL,
  order_index         INTEGER NOT NULL DEFAULT 0,
  ai_context          TEXT CHECK (ai_context IN ('work', 'highlight', 'project', 'education', 'skills', 'narrative', 'section')),
  title               TEXT,
  role                TEXT,
  location            TEXT,
  website             TEXT,
  start_date          TEXT,
  end_date            TEXT,
  description         TEXT,
  skills              TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  created_by          TEXT NOT NULL,
  updated_by          TEXT NOT NULL
);

CREATE INDEX idx_resume_items_version ON resume_items(resume_version_id);
CREATE INDEX idx_resume_items_parent  ON resume_items(parent_id);

-- Seed the 5 resume versions
INSERT INTO resume_versions (id, slug, name, description, created_at, updated_at) VALUES
  ('rv-frontend',          'frontend',          'Frontend Engineer',    'React, TypeScript, UI/UX, design systems',            datetime('now'), datetime('now')),
  ('rv-fullstack',         'fullstack',         'Full Stack Engineer',  'End-to-end web development, Node + React, APIs',      datetime('now'), datetime('now')),
  ('rv-backend',           'backend',           'Backend Engineer',     'APIs, distributed systems, databases, infrastructure', datetime('now'), datetime('now')),
  ('rv-ai',                'ai',                'AI / ML Engineer',     'LLMs, ML pipelines, data engineering, AI tooling',    datetime('now'), datetime('now')),
  ('rv-solution-engineer', 'solution-engineer', 'Solution Engineer',    'Pre-sales, technical consulting, integrations',       datetime('now'), datetime('now'));
