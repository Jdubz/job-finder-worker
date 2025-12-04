-- job-finder SQLite schema
-- Generated November 17, 2025 as part of on-host migration prep
-- Use `sqlite3 jobfinder.db < schema.sql` (or drizzle migrations) to apply

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Consolidated resume/portfolio content
CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('company','project','skill-group','education','profile-section','accomplishment')),
  user_id TEXT NOT NULL,
  parent_id TEXT REFERENCES content_items(id) ON DELETE SET NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  tags TEXT,
  ai_context TEXT,
  body_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_content_items_parent ON content_items (parent_id);

-- Legacy experience + blurb data (kept for worker backfills)
CREATE TABLE IF NOT EXISTS experience_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT,
  location TEXT,
  start_date TEXT,
  end_date TEXT,
  summary TEXT,
  accomplishments TEXT,
  technologies TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS experience_blurbs (
  id TEXT PRIMARY KEY,
  experience_id TEXT REFERENCES experience_entries(id) ON DELETE CASCADE,
  category TEXT,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Companies master list
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL,
  website TEXT,
  about TEXT,
  culture TEXT,
  mission TEXT,
  size TEXT,
  company_size_category TEXT,
  founded TEXT,
  industry TEXT,
  headquarters_location TEXT,
  has_portland_office INTEGER NOT NULL DEFAULT 0,
  tech_stack TEXT,
  tier TEXT,
  priority_score REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_name_lower ON companies (name_lower);

-- Job queue powering the worker pipeline
CREATE TABLE IF NOT EXISTS job_queue (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('job','company')),
  status TEXT NOT NULL CHECK (status IN ('pending','processing','success','failed','skipped','filtered')),
  url TEXT NOT NULL,
  company_name TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  submitted_by TEXT,
  company_id TEXT,
  metadata TEXT,
  scrape_config TEXT,
  scraped_data TEXT,
  source_discovery_config TEXT,
  sub_task TEXT,
  pipeline_state TEXT,
  parent_item_id TEXT,
  company_sub_task TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  processed_at TEXT,
  completed_at TEXT,
  result_message TEXT,
  error_details TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_job_queue_url ON job_queue (url);
CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue (status);
CREATE INDEX IF NOT EXISTS idx_job_queue_source ON job_queue (source);

-- Job match artifacts surfaced to the frontend
CREATE TABLE IF NOT EXISTS job_matches (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  company_id TEXT,
  job_title TEXT NOT NULL,
  location TEXT,
  salary_range TEXT,
  job_description TEXT NOT NULL,
  company_info TEXT,
  match_score REAL NOT NULL,
  matched_skills TEXT,
  missing_skills TEXT,
  match_reasons TEXT,
  key_strengths TEXT,
  potential_concerns TEXT,
  experience_match REAL,
  application_priority TEXT NOT NULL CHECK (application_priority IN ('High','Medium','Low')),
  customization_recommendations TEXT,
  resume_intake_json TEXT,
  analyzed_at TEXT,
  submitted_by TEXT,
  queue_item_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_matches_company ON job_matches (company_name);
CREATE INDEX IF NOT EXISTS idx_job_matches_priority ON job_matches (application_priority);

-- Queue + worker configuration (maps job-finder-config IDs to JSON blobs)
CREATE TABLE IF NOT EXISTS job_finder_config (
  id TEXT PRIMARY KEY,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Job source definitions for scrapers/APIs
CREATE TABLE IF NOT EXISTS job_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL,
  config_json TEXT NOT NULL,
  tags TEXT,
  company_id TEXT,
  company_name TEXT,
  last_scraped_at TEXT,
  last_scraped_status TEXT,
  last_scraped_error TEXT,
  total_jobs_found INTEGER NOT NULL DEFAULT 0,
  total_jobs_matched INTEGER NOT NULL DEFAULT 0,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_job_sources_status ON job_sources (status);
CREATE INDEX IF NOT EXISTS idx_job_sources_company ON job_sources (company_id);

-- Contact form submissions arriving via backend
CREATE TABLE IF NOT EXISTS contact_submissions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  request_id TEXT NOT NULL,
  trace_id TEXT,
  span_id TEXT,
  transaction_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('new','read','replied','spam')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contact_status ON contact_submissions (status);

-- Google Identity Services-authenticated admins/users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  roles TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_login_at TEXT
);

INSERT OR IGNORE INTO users (id, email, display_name, roles, created_at, updated_at, last_login_at)
VALUES
  ('contact-admin', 'contact@joshwentworth.com', 'Contact Admin', 'admin', datetime('now'), datetime('now'), NULL),
  ('jess-admin', 'jess.castaldi@gmail.com', 'Jess Castaldi', 'admin', datetime('now'), datetime('now'), NULL);


-- Convenience view for pulling worker-ready queue data
CREATE VIEW IF NOT EXISTS view_queue_ready AS
SELECT id, url, company_name, status
FROM job_queue
WHERE status = 'pending'
ORDER BY created_at ASC;
